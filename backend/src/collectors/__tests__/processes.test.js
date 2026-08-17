// Exercises the real collector against a fixture procfs, rather than a copy of
// its logic. The previous suite reimplemented the parsing inline, so it kept
// passing after the module it was meant to cover had been rewritten.
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  collectProcesses,
  parseProcStat,
  parseSystemCpuTime,
  parseMemTotal,
  computeCpuPercent,
  __reset,
} = require("../processes");

/**
 * Build a /proc/<pid>/stat line. Field N of the man-page layout lands at
 * index N-3 of the portion after the closing parenthesis.
 */
const makeStatLine = ({
  pid,
  comm,
  state = "S",
  utime = 0,
  stime = 0,
  starttime = 1000,
  vsizeBytes = 0,
  rssPages = 0,
}) => {
  const tail = new Array(25).fill("0");
  tail[0] = state;
  tail[11] = String(utime);
  tail[12] = String(stime);
  tail[19] = String(starttime);
  tail[20] = String(vsizeBytes);
  tail[21] = String(rssPages);
  return `${pid} (${comm}) ${tail.join(" ")}\n`;
};

let procDir;

const writeProcess = (pid, options) => {
  const dir = path.join(procDir, String(pid));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "stat"), makeStatLine({ pid, ...options }));
  if (options.cmdline !== undefined) {
    fs.writeFileSync(path.join(dir, "cmdline"), options.cmdline);
  }
};

const TOTAL_MEM_KB = 8 * 1024 * 1024; // 8 GiB

const writeMeminfo = () => {
  fs.writeFileSync(
    path.join(procDir, "meminfo"),
    `MemTotal:       ${TOTAL_MEM_KB} kB\nMemFree:         1000 kB\n`
  );
};

const writeSystemStat = (values) => {
  fs.writeFileSync(
    path.join(procDir, "stat"),
    `cpu  ${values.join(" ")}\ncpu0 1 2 3 4\nintr 999\n`
  );
};

beforeEach(() => {
  __reset();
  procDir = fs.mkdtempSync(path.join(os.tmpdir(), "procfix-"));
  writeMeminfo();
});

afterEach(() => {
  fs.rmSync(procDir, { recursive: true, force: true });
});

describe("parseProcStat", () => {
  it("extracts the documented fields", () => {
    const result = parseProcStat(
      makeStatLine({
        pid: 1234,
        comm: "nginx",
        state: "R",
        utime: 50,
        stime: 25,
        starttime: 999,
        vsizeBytes: 1024 * 1024,
        rssPages: 128,
      })
    );

    expect(result).toMatchObject({
      pid: 1234,
      name: "nginx",
      state: "R",
      utime: 50,
      stime: 25,
      starttime: 999,
      vsizeBytes: 1024 * 1024,
      rssPages: 128,
    });
  });

  it("handles a comm containing spaces and parentheses", () => {
    // Firefox really does report "(Web Content)" here, which naive
    // whitespace splitting misparses into the wrong fields.
    const result = parseProcStat(
      makeStatLine({ pid: 7, comm: "Web Content (tab)", utime: 11, stime: 3 })
    );

    expect(result.name).toBe("Web Content (tab)");
    expect(result.pid).toBe(7);
    expect(result.utime).toBe(11);
    expect(result.stime).toBe(3);
  });

  it("returns null for malformed input", () => {
    expect(parseProcStat("")).toBeNull();
    expect(parseProcStat("not a stat line")).toBeNull();
    expect(parseProcStat(null)).toBeNull();
  });
});

describe("parseSystemCpuTime", () => {
  it("sums every column of the aggregate cpu line", () => {
    expect(parseSystemCpuTime("cpu  10 20 30 40\ncpu0 1 1 1 1\n")).toBe(100);
  });

  it("ignores lines after the first", () => {
    expect(parseSystemCpuTime("cpu  1 1\ncpu0 999 999\n")).toBe(2);
  });
});

describe("parseMemTotal", () => {
  it("reads MemTotal in bytes", () => {
    expect(parseMemTotal("MemTotal:       16384 kB\nMemFree: 10 kB\n")).toBe(
      16384 * 1024
    );
  });

  it("returns null when the field is absent", () => {
    expect(parseMemTotal("MemFree: 10 kB")).toBeNull();
  });
});

describe("computeCpuPercent", () => {
  it("scales by core count", () => {
    expect(computeCpuPercent(10, 100, 4)).toBe(40);
  });

  it("caps at 100", () => {
    expect(computeCpuPercent(90, 100, 8)).toBe(100);
  });

  it("returns 0 when there is no elapsed system time", () => {
    expect(computeCpuPercent(10, 0, 4)).toBe(0);
    expect(computeCpuPercent(10, -5, 4)).toBe(0);
  });
});

describe("collectProcesses", () => {
  it("reads processes and counts them by state", async () => {
    writeSystemStat([1000, 0, 0, 0]);
    writeProcess(100, { comm: "bash", state: "S", rssPages: 100 });
    writeProcess(200, { comm: "worker", state: "R", rssPages: 200 });
    writeProcess(300, { comm: "io", state: "D", rssPages: 50 });
    writeProcess(400, { comm: "idler", state: "I", rssPages: 10 });
    writeProcess(500, { comm: "zombie", state: "Z", rssPages: 0 });

    const result = await collectProcesses({ procPath: procDir });

    expect(result.all).toBe(5);
    expect(result.running).toBe(1);
    expect(result.blocked).toBe(1);
    expect(result.sleeping).toBe(2); // S and I
    expect(result.list).toHaveLength(5);
  });

  it("sorts by resident memory and honours the limit", async () => {
    writeSystemStat([1000]);
    writeProcess(1, { comm: "small", rssPages: 10 });
    writeProcess(2, { comm: "huge", rssPages: 5000 });
    writeProcess(3, { comm: "medium", rssPages: 500 });

    const result = await collectProcesses({ procPath: procDir, limit: 2 });

    expect(result.list.map((p) => p.name)).toEqual(["huge", "medium"]);
    expect(result.all).toBe(3); // total still counts everything
  });

  it("reports 0% CPU on the first sample and a real value on the second", async () => {
    writeSystemStat([1000]);
    writeProcess(1, { comm: "busy", utime: 100, stime: 0, rssPages: 10 });

    const first = await collectProcesses({ procPath: procDir });
    // No prior sample exists, so there is nothing to diff against.
    expect(first.list[0].cpu).toBe(0);

    // Advance: the process used 10 jiffies of the 100 the system advanced.
    writeSystemStat([1100]);
    writeProcess(1, { comm: "busy", utime: 110, stime: 0, rssPages: 10 });

    const second = await collectProcesses({ procPath: procDir });
    expect(second.list[0].cpu).toBeGreaterThan(0);
  });

  it("does not attribute a recycled PID's CPU time to the new process", async () => {
    writeSystemStat([1000]);
    writeProcess(1, {
      comm: "old",
      utime: 5000,
      starttime: 100,
      rssPages: 10,
    });
    await collectProcesses({ procPath: procDir });

    // Same PID, different process: starttime differs and the counter restarts.
    writeSystemStat([1100]);
    writeProcess(1, { comm: "new", utime: 5, starttime: 900, rssPages: 10 });

    const result = await collectProcesses({ procPath: procDir });
    // A stale baseline of 5000 would produce a large negative delta.
    expect(result.list[0].name).toBe("new");
    expect(result.list[0].cpu).toBe(0);
  });

  it("resolves the command line for returned processes", async () => {
    writeSystemStat([1000]);
    writeProcess(1, {
      comm: "nginx",
      rssPages: 100,
      cmdline: "nginx\0-g\0daemon off;\0",
    });

    const result = await collectProcesses({ procPath: procDir });
    expect(result.list[0].command).toBe("nginx -g daemon off;");
  });

  it("falls back to the process name when cmdline is empty", async () => {
    writeSystemStat([1000]);
    // Kernel threads expose an empty cmdline.
    writeProcess(1, { comm: "kthreadd", rssPages: 5, cmdline: "" });

    const result = await collectProcesses({ procPath: procDir });
    expect(result.list[0].command).toBe("kthreadd");
  });

  it("skips processes that exit mid-scan", async () => {
    writeSystemStat([1000]);
    writeProcess(1, { comm: "alive", rssPages: 10 });
    // A directory with no readable stat mimics a process that just exited.
    fs.mkdirSync(path.join(procDir, "999"), { recursive: true });

    const result = await collectProcesses({ procPath: procDir });
    expect(result.list.map((p) => p.name)).toEqual(["alive"]);
  });

  it("ignores non-numeric entries in procfs", async () => {
    writeSystemStat([1000]);
    writeProcess(1, { comm: "real", rssPages: 10 });
    fs.mkdirSync(path.join(procDir, "sys"), { recursive: true });
    fs.writeFileSync(path.join(procDir, "uptime"), "123 456");

    const result = await collectProcesses({ procPath: procDir });
    expect(result.all).toBe(1);
  });

  it("converts rss pages into kilobytes and a memory percentage", async () => {
    writeSystemStat([1000]);
    // 256 pages * 4096 = 1 MiB against the 8 GiB total the mock reports.
    writeProcess(1, { comm: "app", rssPages: 256 });

    const result = await collectProcesses({ procPath: procDir });
    const proc = result.list[0];

    expect(proc.memRss).toBe(1024); // KiB
    expect(proc.memRssMB).toBeCloseTo(1, 5);
    expect(proc.mem).toBeCloseTo((1 / 8192) * 100, 5);
  });
});
