/**
 * Process collection from /proc.
 *
 * The previous implementation issued four synchronous filesystem calls per PID
 * (existsSync + status + stat + cmdline). On a host with ~300 processes that is
 * ~1200 blocking syscalls on the event loop every two seconds, which stalls
 * every other request for the duration.
 *
 * This version:
 *   - reads /proc/<pid>/stat only, which already carries comm, state, utime,
 *     stime, starttime, vsize and rss, replacing the separate status read;
 *   - takes the owning uid from stat()ing /proc/<pid> instead of parsing
 *     the status file for it;
 *   - reads cmdline only for the processes that survive into the response, and
 *     caches it per (pid, starttime) since a process's argv never changes;
 *   - runs asynchronously with bounded concurrency so the event loop breathes.
 */
const fs = require("fs/promises");
const fsSync = require("fs");
const os = require("os");

const numCpus = os.cpus().length;
const UID_CACHE_TTL = 60000;
const CMDLINE_CACHE_MAX = 2000;
const CONCURRENCY = 64;

let uidCache = {};
let uidCacheTime = 0;
/** pid -> { totalTime, starttime } from the previous sample. */
let prevCpuTimes = new Map();
let prevSystemTime = 0;
/** "pid:starttime" -> command string. */
let cmdlineCache = new Map();
let pageSizeBytes = null;

/** Total physical memory in bytes, from procfs rather than a full si.mem() probe. */
const parseMemTotal = (content) => {
  const match = /^MemTotal:\s+(\d+)\s+kB$/m.exec(content);
  return match ? Number(match[1]) * 1024 : null;
};

/**
 * Determine the kernel page size so stat's rss (in pages) converts to bytes.
 * Derived by cross-checking our own stat rss against status VmRSS rather than
 * assuming 4 KiB, since arm64 kernels are configurable.
 */
const detectPageSize = (procPath) => {
  if (pageSizeBytes) return pageSizeBytes;
  try {
    const stat = fsSync.readFileSync(`${procPath}/self/stat`, "utf8");
    const status = fsSync.readFileSync(`${procPath}/self/status`, "utf8");
    const rssPages = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[21]);
    const vmRssKb = Number(status.match(/^VmRSS:\s+(\d+)\s+kB$/m)?.[1]);
    if (rssPages > 0 && vmRssKb > 0) {
      const derived = (vmRssKb * 1024) / rssPages;
      // Snap to a real page size; anything else means our reading was racy.
      if ([4096, 8192, 16384, 65536].includes(derived)) {
        pageSizeBytes = derived;
        return pageSizeBytes;
      }
    }
  } catch {
    // fall through to the default
  }
  pageSizeBytes = 4096;
  return pageSizeBytes;
};

/**
 * Parse a /proc/<pid>/stat line.
 *
 * comm sits in parentheses and may itself contain spaces or parentheses
 * ("(Web Content)"), so everything after the final ')' is split positionally.
 * Field N of the man-page layout is at index N-3 of that tail.
 *
 * @returns {{pid:number,name:string,state:string,utime:number,stime:number,
 *            starttime:number,vsizeBytes:number,rssPages:number}|null}
 */
const parseProcStat = (content) => {
  if (!content) return null;
  const open = content.indexOf("(");
  const close = content.lastIndexOf(")");
  if (open === -1 || close === -1 || close < open) return null;

  const pid = Number(content.slice(0, open).trim());
  if (!Number.isFinite(pid)) return null;

  const name = content.slice(open + 1, close);
  const tail = content.slice(close + 2).split(" ");

  const num = (i) => {
    const v = Number(tail[i]);
    return Number.isFinite(v) ? v : 0;
  };

  return {
    pid,
    name,
    state: tail[0] || "S",
    utime: num(11),
    stime: num(12),
    starttime: num(19),
    vsizeBytes: num(20),
    rssPages: num(21),
  };
};

/** Sum the aggregate CPU jiffies from the first line of /proc/stat. */
const parseSystemCpuTime = (content) => {
  const line = content.split("\n", 1)[0];
  return line
    .split(/\s+/)
    .slice(1)
    .reduce((total, field) => {
      const v = Number(field);
      return total + (Number.isFinite(v) ? v : 0);
    }, 0);
};

/**
 * Share of total CPU capacity used by a process between two samples,
 * expressed as a percentage of a single core (so 100% = one saturated core).
 */
const computeCpuPercent = (procTimeDelta, systemTimeDelta, cpuCount) => {
  if (systemTimeDelta <= 0 || procTimeDelta < 0) return 0;
  return Math.min((procTimeDelta / systemTimeDelta) * 100 * cpuCount, 100);
};

const refreshUidCache = async () => {
  const now = Date.now();
  if (now - uidCacheTime < UID_CACHE_TTL && Object.keys(uidCache).length > 0) {
    return;
  }
  try {
    const passwd = await fs.readFile("/etc/passwd", "utf8");
    const next = {};
    for (const line of passwd.split("\n")) {
      const parts = line.split(":");
      if (parts.length >= 3) next[parts[2]] = parts[0];
    }
    uidCache = next;
    uidCacheTime = now;
  } catch {
    // Keep the previous cache; uid numbers are an acceptable fallback.
  }
};

/** Run an async mapper over items, at most `limit` in flight. */
const mapWithConcurrency = async (items, limit, mapper) => {
  const results = new Array(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index]);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
};

const readCommand = async (procPath, pid, starttime, fallback) => {
  const key = `${pid}:${starttime}`;
  const cached = cmdlineCache.get(key);
  if (cached !== undefined) return cached;

  let command = fallback;
  try {
    const raw = await fs.readFile(`${procPath}/${pid}/cmdline`, "utf8");
    command = raw.replace(/\0/g, " ").trim() || fallback;
  } catch {
    // Kernel threads have an empty cmdline; the comm name is the right answer.
  }

  command = command.slice(0, 100);
  if (cmdlineCache.size >= CMDLINE_CACHE_MAX) cmdlineCache.clear();
  cmdlineCache.set(key, command);
  return command;
};

/**
 * @param {object} options
 * @param {string} options.procPath - root of the (possibly bind-mounted) procfs
 * @param {number} options.limit - max processes to return
 */
const collectProcesses = async ({ procPath = "/proc", limit = 150 } = {}) => {
  await refreshUidCache();
  const pageSize = detectPageSize(procPath);

  const [meminfoRaw, cpuStatRaw, entries] = await Promise.all([
    fs.readFile(`${procPath}/meminfo`, "utf8").catch(() => ""),
    fs.readFile(`${procPath}/stat`, "utf8"),
    fs.readdir(procPath),
  ]);

  const totalMemBytes = parseMemTotal(meminfoRaw) ?? os.totalmem();
  const currentSystemTime = parseSystemCpuTime(cpuStatRaw);
  // A first sample has no baseline, so report 0% rather than a bogus spike.
  const systemTimeDelta = prevSystemTime ? currentSystemTime - prevSystemTime : 0;

  const pids = entries.filter((entry) => {
    // Cheaper than a regex across several hundred entries.
    const code = entry.charCodeAt(0);
    return code >= 48 && code <= 57;
  });

  const nextCpuTimes = new Map();
  let running = 0;
  let sleeping = 0;
  let blocked = 0;

  const sampled = await mapWithConcurrency(pids, CONCURRENCY, async (pid) => {
    let statContent;
    let uid = 0;
    try {
      // The process can exit between readdir and here; both calls may ENOENT.
      const [content, stats] = await Promise.all([
        fs.readFile(`${procPath}/${pid}/stat`, "utf8"),
        fs.stat(`${procPath}/${pid}`),
      ]);
      statContent = content;
      uid = stats.uid;
    } catch {
      return null;
    }

    const proc = parseProcStat(statContent);
    if (!proc || !proc.name) return null;

    const totalProcTime = proc.utime + proc.stime;
    nextCpuTimes.set(proc.pid, {
      totalTime: totalProcTime,
      starttime: proc.starttime,
    });

    const prev = prevCpuTimes.get(proc.pid);
    // If starttime differs the PID was recycled, so the old counter is not ours.
    const baseline =
      prev && prev.starttime === proc.starttime ? prev.totalTime : totalProcTime;

    const rssBytes = proc.rssPages * pageSize;

    return {
      pid: proc.pid,
      name: proc.name,
      state: proc.state,
      starttime: proc.starttime,
      cpu: computeCpuPercent(
        totalProcTime - baseline,
        systemTimeDelta,
        numCpus
      ),
      mem: totalMemBytes > 0 ? (rssBytes / totalMemBytes) * 100 : 0,
      memVsz: Math.round(proc.vsizeBytes / 1024),
      memRss: Math.round(rssBytes / 1024),
      memRssMB: rssBytes / (1024 * 1024),
      user: uidCache[String(uid)] || String(uid),
    };
  });

  const processList = [];
  for (const proc of sampled) {
    if (!proc) continue;
    if (proc.state === "R") running++;
    else if (proc.state === "S" || proc.state === "I") sleeping++;
    else if (proc.state === "D") blocked++;
    processList.push(proc);
  }

  processList.sort((a, b) => b.memRssMB - a.memRssMB);

  prevSystemTime = currentSystemTime;
  // Replacing the map wholesale retires dead PIDs without a separate sweep.
  prevCpuTimes = nextCpuTimes;

  const top = processList.slice(0, limit);

  // cmdline is only needed for rows the client will actually display.
  await mapWithConcurrency(top, CONCURRENCY, async (proc) => {
    proc.command = await readCommand(
      procPath,
      proc.pid,
      proc.starttime,
      proc.name
    );
    delete proc.starttime;
  });

  return {
    all: processList.length,
    running,
    blocked,
    sleeping,
    list: top,
  };
};

/** Test seam: drop all memoised state. */
const __reset = () => {
  uidCache = {};
  uidCacheTime = 0;
  prevCpuTimes = new Map();
  prevSystemTime = 0;
  cmdlineCache = new Map();
  pageSizeBytes = null;
};

module.exports = {
  collectProcesses,
  parseProcStat,
  parseSystemCpuTime,
  parseMemTotal,
  computeCpuPercent,
  __reset,
};
