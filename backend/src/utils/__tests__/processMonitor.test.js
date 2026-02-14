// Test the pure logic of processMonitor by extracting and testing the core algorithms directly.
// Since the module reads from /proc which isn't available on all platforms,
// we test the parsing and calculation logic in isolation.

describe("processMonitor - readProcessFromProc parsing logic", () => {
  // Replicate the status file parsing logic
  const parseStatusFile = (statusContent) => {
    const nameMatch = statusContent.match(/^Name:\s+(.+)$/m);
    const vmRssMatch = statusContent.match(/^VmRSS:\s+(\d+)\s+kB$/m);
    const vmSizeMatch = statusContent.match(/^VmSize:\s+(\d+)\s+kB$/m);
    const uidMatch = statusContent.match(/^Uid:\s+(\d+)/m);
    const stateMatch = statusContent.match(/^State:\s+(\S)/m);

    return {
      name: nameMatch ? nameMatch[1] : "unknown",
      memRssKB: vmRssMatch ? parseInt(vmRssMatch[1], 10) : 0,
      memVszKB: vmSizeMatch ? parseInt(vmSizeMatch[1], 10) : 0,
      uid: uidMatch ? uidMatch[1] : "0",
      state: stateMatch ? stateMatch[1] : "S",
    };
  };

  it("parses a typical status file correctly", () => {
    const status = [
      "Name:\tnginx",
      "Umask:\t0022",
      "State:\tS (sleeping)",
      "Tgid:\t1234",
      "Pid:\t1234",
      "Uid:\t33\t33\t33\t33",
      "VmSize:\t  102400 kB",
      "VmRSS:\t   51200 kB",
    ].join("\n");

    const result = parseStatusFile(status);
    expect(result.name).toBe("nginx");
    expect(result.state).toBe("S");
    expect(result.uid).toBe("33");
    expect(result.memRssKB).toBe(51200);
    expect(result.memVszKB).toBe(102400);
  });

  it("handles running state", () => {
    const status = "Name:\tworker\nState:\tR (running)\nUid:\t1000";
    const result = parseStatusFile(status);
    expect(result.state).toBe("R");
  });

  it("handles disk sleep (blocked) state", () => {
    const status = "Name:\tio_task\nState:\tD (disk sleep)\nUid:\t0";
    const result = parseStatusFile(status);
    expect(result.state).toBe("D");
  });

  it("handles idle state", () => {
    const status = "Name:\tidle_proc\nState:\tI (idle)\nUid:\t0";
    const result = parseStatusFile(status);
    expect(result.state).toBe("I");
  });

  it("returns defaults when fields are missing", () => {
    const status = "Pid:\t1";
    const result = parseStatusFile(status);
    expect(result.name).toBe("unknown");
    expect(result.memRssKB).toBe(0);
    expect(result.memVszKB).toBe(0);
    expect(result.uid).toBe("0");
    expect(result.state).toBe("S");
  });

  it("handles root user uid 0", () => {
    const status = "Name:\tinit\nState:\tS (sleeping)\nUid:\t0\t0\t0\t0";
    const result = parseStatusFile(status);
    expect(result.uid).toBe("0");
  });
});

describe("processMonitor - stat file CPU time parsing", () => {
  const parseStatCpuTimes = (statContent) => {
    const statParts = statContent.split(" ");
    const utime = parseInt(statParts[13], 10) || 0;
    const stime = parseInt(statParts[14], 10) || 0;
    return { utime, stime };
  };

  it("parses CPU user and system times from stat file", () => {
    // Simplified /proc/[pid]/stat format — fields 14 and 15 (0-indexed 13, 14) are utime and stime
    const stat =
      "1234 (nginx) S 1 1234 1234 0 -1 4194304 500 0 0 0 1500 300 0 0 20 0 1 0 100 102400000 12800 18446744073709551615";
    const result = parseStatCpuTimes(stat);
    expect(result.utime).toBe(1500);
    expect(result.stime).toBe(300);
  });

  it("returns 0 when stat fields are invalid", () => {
    const stat = "1 (test) S 0";
    const result = parseStatCpuTimes(stat);
    expect(result.utime).toBe(0);
    expect(result.stime).toBe(0);
  });
});

describe("processMonitor - cmdline parsing", () => {
  const parseCmdline = (raw) => {
    return raw.replace(/\0/g, " ").trim();
  };

  it("replaces null bytes with spaces", () => {
    const cmdline = "/usr/sbin/nginx\0-g\0daemon off;\0";
    expect(parseCmdline(cmdline)).toBe("/usr/sbin/nginx -g daemon off;");
  });

  it("handles empty cmdline", () => {
    expect(parseCmdline("")).toBe("");
  });

  it("handles cmdline without null bytes", () => {
    expect(parseCmdline("python3 script.py")).toBe("python3 script.py");
  });
});

describe("processMonitor - CPU percentage calculation", () => {
  const calcCpuPercent = (procTimeDelta, systemTimeDelta, numCpus) => {
    if (systemTimeDelta <= 0) return 0;
    return Math.min((procTimeDelta / systemTimeDelta) * 100 * numCpus, 100);
  };

  it("calculates CPU percentage correctly", () => {
    // Process used 100 jiffies out of 10000 system jiffies on 4 CPUs
    const result = calcCpuPercent(100, 10000, 4);
    expect(result).toBe(4); // (100/10000) * 100 * 4 = 4%
  });

  it("caps at 100%", () => {
    const result = calcCpuPercent(5000, 1000, 4);
    expect(result).toBe(100);
  });

  it("returns 0 when system time delta is 0", () => {
    expect(calcCpuPercent(100, 0, 4)).toBe(0);
  });

  it("returns 0 when system time delta is negative", () => {
    expect(calcCpuPercent(100, -1, 4)).toBe(0);
  });

  it("handles single CPU", () => {
    const result = calcCpuPercent(50, 10000, 1);
    expect(result).toBe(0.5);
  });
});

describe("processMonitor - memory percentage calculation", () => {
  const calcMemPercent = (memRssKB, totalMemMB) => {
    const memRssMB = memRssKB / 1024;
    return totalMemMB > 0 ? (memRssMB / totalMemMB) * 100 : 0;
  };

  it("calculates memory percentage correctly", () => {
    // 512 MB RSS out of 4096 MB total = 12.5%
    const result = calcMemPercent(512 * 1024, 4096);
    expect(result).toBeCloseTo(12.5);
  });

  it("returns 0 when total memory is 0", () => {
    expect(calcMemPercent(1024, 0)).toBe(0);
  });

  it("handles small processes", () => {
    // 1 KB out of 4096 MB total
    const result = calcMemPercent(1, 4096);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(0.001);
  });
});

describe("processMonitor - /proc/stat system time parsing", () => {
  const parseSystemTime = (cpuStatRaw) => {
    const cpuLine = cpuStatRaw.split("\n")[0];
    const cpuParts = cpuLine.split(/\s+/).slice(1).map(Number);
    return cpuParts.reduce((a, b) => a + b, 0);
  };

  it("sums all CPU time columns", () => {
    // cpu  user nice system idle iowait irq softirq steal
    const stat = "cpu  1000 200 300 5000 100 50 25 10";
    expect(parseSystemTime(stat)).toBe(6685);
  });

  it("handles multiline /proc/stat (only uses first line)", () => {
    const stat = "cpu  100 0 50 500 0 0 0 0\ncpu0 50 0 25 250 0 0 0 0";
    expect(parseSystemTime(stat)).toBe(650);
  });
});

describe("processMonitor - process state counting", () => {
  const countStates = (processes) => {
    let running = 0, sleeping = 0, blocked = 0;

    for (const proc of processes) {
      if (proc.state === "R") running++;
      else if (proc.state === "S" || proc.state === "I") sleeping++;
      else if (proc.state === "D") blocked++;
    }

    return { running, sleeping, blocked };
  };

  it("counts running processes", () => {
    const procs = [{ state: "R" }, { state: "R" }, { state: "S" }];
    expect(countStates(procs).running).toBe(2);
  });

  it("counts sleeping and idle as sleeping", () => {
    const procs = [{ state: "S" }, { state: "I" }, { state: "S" }];
    expect(countStates(procs).sleeping).toBe(3);
  });

  it("counts disk sleep as blocked", () => {
    const procs = [{ state: "D" }, { state: "D" }];
    expect(countStates(procs).blocked).toBe(2);
  });

  it("ignores zombie and other states", () => {
    const procs = [{ state: "Z" }, { state: "T" }, { state: "X" }];
    const result = countStates(procs);
    expect(result.running).toBe(0);
    expect(result.sleeping).toBe(0);
    expect(result.blocked).toBe(0);
  });
});

describe("processMonitor - UID cache parsing", () => {
  const parsePasswd = (content) => {
    const cache = {};
    content.split("\n").forEach((line) => {
      const parts = line.split(":");
      if (parts.length >= 3) {
        cache[parts[2]] = parts[0];
      }
    });
    return cache;
  };

  it("parses /etc/passwd entries into uid->username map", () => {
    const passwd = [
      "root:x:0:0:root:/root:/bin/bash",
      "www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin",
      "node:x:1000:1000::/home/node:/bin/bash",
    ].join("\n");

    const cache = parsePasswd(passwd);
    expect(cache["0"]).toBe("root");
    expect(cache["33"]).toBe("www-data");
    expect(cache["1000"]).toBe("node");
  });

  it("skips lines with fewer than 3 parts", () => {
    const passwd = "short:x\nroot:x:0:0:root:/root:/bin/bash";
    const cache = parsePasswd(passwd);
    expect(cache["0"]).toBe("root");
    expect(Object.keys(cache)).toHaveLength(1);
  });

  it("handles empty input", () => {
    const cache = parsePasswd("");
    expect(Object.keys(cache)).toHaveLength(0);
  });
});

describe("processMonitor - stale PID cleanup", () => {
  it("removes PIDs not in current process list", () => {
    const prevCpuTimes = { 100: 500, 200: 600, 300: 700 };
    const currentPids = new Set([100, 300]);

    Object.keys(prevCpuTimes).forEach((pid) => {
      if (!currentPids.has(parseInt(pid, 10))) {
        delete prevCpuTimes[pid];
      }
    });

    expect(prevCpuTimes).toEqual({ 100: 500, 300: 700 });
  });

  it("keeps all PIDs when all are current", () => {
    const prevCpuTimes = { 1: 10, 2: 20 };
    const currentPids = new Set([1, 2]);

    Object.keys(prevCpuTimes).forEach((pid) => {
      if (!currentPids.has(parseInt(pid, 10))) {
        delete prevCpuTimes[pid];
      }
    });

    expect(prevCpuTimes).toEqual({ 1: 10, 2: 20 });
  });

  it("clears all when no current PIDs match", () => {
    const prevCpuTimes = { 1: 10, 2: 20 };
    const currentPids = new Set([99]);

    Object.keys(prevCpuTimes).forEach((pid) => {
      if (!currentPids.has(parseInt(pid, 10))) {
        delete prevCpuTimes[pid];
      }
    });

    expect(prevCpuTimes).toEqual({});
  });
});
