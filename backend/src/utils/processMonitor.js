/**
 * Shared process monitoring utility
 * Used by both REST API (metrics.js) and WebSocket (channels.js)
 */
const fs = require("fs");
const si = require("systeminformation");
const os = require("os");

const PROC_PATH = process.env.HOST_PROC || "/proc";
const UID_CACHE_TTL = 60000;
const numCpus = os.cpus().length;

// Shared state
let uidCache = {};
let uidCacheTime = 0;
let prevCpuTimes = {};
let prevSystemTime = 0;

const refreshUidCache = () => {
  const now = Date.now();
  if (now - uidCacheTime < UID_CACHE_TTL && Object.keys(uidCache).length > 0) {
    return;
  }
  try {
    const passwd = fs.readFileSync("/etc/passwd", "utf8");
    uidCache = {};
    passwd.split("\n").forEach((line) => {
      const parts = line.split(":");
      if (parts.length >= 3) {
        uidCache[parts[2]] = parts[0];
      }
    });
    uidCacheTime = now;
  } catch (e) {
    // Keep existing cache on error
  }
};

const readProcessFromProc = (pid) => {
  try {
    const statusPath = `${PROC_PATH}/${pid}/status`;
    const statPath = `${PROC_PATH}/${pid}/stat`;
    const cmdlinePath = `${PROC_PATH}/${pid}/cmdline`;

    if (!fs.existsSync(statusPath)) return null;

    const status = fs.readFileSync(statusPath, "utf8");
    const stat = fs.readFileSync(statPath, "utf8");

    const nameMatch = status.match(/^Name:\s+(.+)$/m);
    const vmRssMatch = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
    const vmSizeMatch = status.match(/^VmSize:\s+(\d+)\s+kB$/m);
    const uidMatch = status.match(/^Uid:\s+(\d+)/m);
    const stateMatch = status.match(/^State:\s+(\S)/m);

    const name = nameMatch ? nameMatch[1] : "unknown";
    const memRssKB = vmRssMatch ? parseInt(vmRssMatch[1], 10) : 0;
    const memVszKB = vmSizeMatch ? parseInt(vmSizeMatch[1], 10) : 0;
    const uid = uidMatch ? uidMatch[1] : "0";
    const state = stateMatch ? stateMatch[1] : "S";

    const statParts = stat.split(" ");
    const utime = parseInt(statParts[13], 10) || 0;
    const stime = parseInt(statParts[14], 10) || 0;

    let command = name;
    try {
      if (fs.existsSync(cmdlinePath)) {
        const cmdline = fs.readFileSync(cmdlinePath, "utf8");
        command = cmdline.replace(/\0/g, " ").trim() || name;
      }
    } catch (e) {
      // Ignore cmdline read errors
    }

    const user = uidCache[uid] || uid;

    return {
      pid: parseInt(pid, 10),
      name,
      memRssKB,
      memVszKB,
      utime,
      stime,
      command: command.substring(0, 100),
      user,
      state,
    };
  } catch (e) {
    return null;
  }
};

/**
 * Fetch full process list with CPU and memory percentages
 */
const getProcessList = async () => {
  refreshUidCache();

  const mem = await si.mem();
  const totalMemBytes = mem.total;
  const totalMemMB = totalMemBytes / (1024 * 1024);

  const cpuStatRaw = fs.readFileSync(`${PROC_PATH}/stat`, "utf8");
  const cpuLine = cpuStatRaw.split("\n")[0];
  const cpuParts = cpuLine.split(/\s+/).slice(1).map(Number);
  const currentSystemTime = cpuParts.reduce((a, b) => a + b, 0);
  const systemTimeDelta = currentSystemTime - prevSystemTime;

  const procDirs = fs
    .readdirSync(PROC_PATH)
    .filter((dir) => /^\d+$/.test(dir));

  let running = 0;
  let sleeping = 0;
  let blocked = 0;

  const processList = procDirs
    .map((pid) => {
      const proc = readProcessFromProc(pid);
      if (!proc) return null;

      if (proc.state === "R") running++;
      else if (proc.state === "S" || proc.state === "I") sleeping++;
      else if (proc.state === "D") blocked++;

      const totalProcTime = proc.utime + proc.stime;
      const prevTime = prevCpuTimes[proc.pid] || totalProcTime;
      const procTimeDelta = totalProcTime - prevTime;

      prevCpuTimes[proc.pid] = totalProcTime;

      const cpuPercent =
        systemTimeDelta > 0
          ? (procTimeDelta / systemTimeDelta) * 100 * numCpus
          : 0;

      const memRssMB = proc.memRssKB / 1024;
      const memPercent = totalMemMB > 0 ? (memRssMB / totalMemMB) * 100 : 0;

      return {
        pid: proc.pid,
        name: proc.name,
        cpu: Math.min(cpuPercent, 100),
        mem: memPercent,
        memVsz: proc.memVszKB,
        memRss: proc.memRssKB,
        memRssMB: memRssMB,
        command: proc.command,
        user: proc.user,
        state: proc.state,
        started: "",
      };
    })
    .filter((proc) => proc !== null && proc.name)
    .sort((a, b) => b.memRssMB - a.memRssMB);

  prevSystemTime = currentSystemTime;

  // Clean up old PIDs from prevCpuTimes
  const currentPids = new Set(processList.map((p) => p.pid));
  Object.keys(prevCpuTimes).forEach((pid) => {
    if (!currentPids.has(parseInt(pid, 10))) {
      delete prevCpuTimes[pid];
    }
  });

  return {
    all: processList.length,
    running,
    blocked,
    sleeping,
    list: processList.slice(0, 150),
  };
};

module.exports = { getProcessList };
