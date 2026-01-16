const express = require("express");
const si = require("systeminformation");
const fs = require("fs");
const router = express.Router();

// Get system metrics (CPU, RAM, etc.)
router.get("/system", async (req, res) => {
  try {
    const [cpu, mem, currentLoad, time] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.currentLoad(),
      si.time(),
    ]);

    res.json({
      cpu: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        cores: cpu.cores,
        speed: cpu.speed,
        currentLoad: currentLoad.currentLoad.toFixed(2),
        avgLoad: currentLoad.avgLoad,
      },
      memory: {
        total: mem.total,
        free: mem.free,
        used: mem.active || mem.used,
        available: mem.available,
        usedPercentage: (((mem.active || mem.used) / mem.total) * 100).toFixed(
          2
        ),
      },
      uptime: time.uptime,
    });
  } catch (error) {
    console.error("System metrics error:", error.message);
    res.status(500).json({
      error: "Failed to fetch system metrics",
      message: error.message,
    });
  }
});

// Get temperature data
router.get("/temperature", async (req, res) => {
  try {
    // Try to read Raspberry Pi CPU temperature
    let cpuTemp = null;
    const tempPath = "/sys/class/thermal/thermal_zone0/temp";

    if (fs.existsSync(tempPath)) {
      const tempRaw = fs.readFileSync(tempPath, "utf8");
      cpuTemp = (parseInt(tempRaw) / 1000).toFixed(1);
    } else {
      // Fallback to systeminformation
      const temp = await si.cpuTemperature();
      cpuTemp = temp.main ? temp.main.toFixed(1) : null;
    }

    res.json({
      cpu: cpuTemp,
      unit: "C",
    });
  } catch (error) {
    console.error("Temperature error:", error.message);
    res.status(500).json({
      error: "Failed to fetch temperature",
      message: error.message,
    });
  }
});

// Get disk usage
router.get("/disk", async (req, res) => {
  try {
    const fsSize = await si.fsSize();
    const mainDisk = fsSize[0] || fsSize.find((fs) => fs.mount === "/");

    res.json({
      total: mainDisk.size,
      used: mainDisk.used,
      available: mainDisk.available,
      usedPercentage: mainDisk.use.toFixed(2),
      mount: mainDisk.mount,
    });
  } catch (error) {
    console.error("Disk metrics error:", error.message);
    res.status(500).json({
      error: "Failed to fetch disk metrics",
      message: error.message,
    });
  }
});

// Get detailed disk information for all mounts
router.get("/disk/detailed", async (req, res) => {
  try {
    const fsSize = await si.fsSize();

    // Filter to show unique physical drives (avoid duplicate mounts)
    // Group by filesystem device (fs field) and keep only primary mounts
    const seenFilesystems = new Set();
    const uniqueDisks = fsSize.filter((disk) => {
      // Skip if we've already seen this filesystem device
      if (seenFilesystems.has(disk.fs)) {
        return false;
      }

      // Skip overlay, tmpfs, devtmpfs, and other virtual filesystems
      if (
        disk.type === "overlay" ||
        disk.type === "tmpfs" ||
        disk.type === "devtmpfs" ||
        disk.fs.startsWith("overlay") ||
        disk.fs.startsWith("tmpfs") ||
        disk.mount.startsWith("/dev") ||
        disk.mount.startsWith("/sys") ||
        disk.mount.startsWith("/proc") ||
        disk.mount.startsWith("/run")
      ) {
        return false;
      }

      seenFilesystems.add(disk.fs);
      return true;
    });

    const diskInfo = uniqueDisks.map((disk) => ({
      fs: disk.fs,
      type: disk.type,
      size: disk.size,
      used: disk.used,
      available: disk.available,
      use: disk.use,
      mount: disk.mount,
      sizeGB: (disk.size / 1024 ** 3).toFixed(2),
      usedGB: (disk.used / 1024 ** 3).toFixed(2),
      availableGB: (disk.available / 1024 ** 3).toFixed(2),
    }));

    res.json(diskInfo);
  } catch (error) {
    console.error("Detailed disk info error:", error.message);
    res.status(500).json({
      error: "Failed to fetch detailed disk information",
      message: error.message,
    });
  }
});

// Get network interfaces and statistics
router.get("/network", async (req, res) => {
  try {
    // Get all data in parallel
    const [interfaces, defaultInterface] = await Promise.all([
      si.networkInterfaces(),
      si.networkInterfaceDefault(),
    ]);

    // Get network stats with a specific call per interface for better accuracy
    // Using '*' gets all interfaces at once which is more efficient
    const stats = await si.networkStats("*");

    // Filter out loopback and inactive interfaces for cleaner display
    const activeInterfaces = interfaces.filter(
      (iface) =>
        iface.iface !== "lo" &&
        iface.iface !== "lo0" &&
        !iface.iface.startsWith("veth") &&
        !iface.iface.startsWith("br-") &&
        !iface.iface.startsWith("docker")
    );

    // Filter stats to match active interfaces
    const activeStats = stats.filter(
      (stat) =>
        stat.iface !== "lo" &&
        stat.iface !== "lo0" &&
        !stat.iface.startsWith("veth") &&
        !stat.iface.startsWith("br-") &&
        !stat.iface.startsWith("docker")
    );

    res.json({
      interfaces: activeInterfaces.map((iface) => ({
        name: iface.iface,
        ip4: iface.ip4,
        ip6: iface.ip6,
        mac: iface.mac,
        type: iface.type,
        speed: iface.speed,
        operstate: iface.operstate,
        isDefault: iface.iface === defaultInterface,
      })),
      stats: activeStats.map((stat) => ({
        interface: stat.iface,
        rx_bytes: stat.rx_bytes || 0,
        tx_bytes: stat.tx_bytes || 0,
        rx_sec: stat.rx_sec || 0,
        tx_sec: stat.tx_sec || 0,
        rx_dropped: stat.rx_dropped || 0,
        tx_dropped: stat.tx_dropped || 0,
        rx_errors: stat.rx_errors || 0,
        tx_errors: stat.tx_errors || 0,
        ms: stat.ms || 0,
      })),
      defaultInterface: defaultInterface,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Network metrics error:", error.message);
    res.status(500).json({
      error: "Failed to fetch network metrics",
      message: error.message,
    });
  }
});

// Use HOST_PROC env var if set (for Docker), otherwise use /proc
const PROC_PATH = process.env.HOST_PROC || "/proc";

// Helper to read process info directly from /proc
const readProcessFromProc = (pid) => {
  try {
    // Read process status
    const statusPath = `${PROC_PATH}/${pid}/status`;
    const statPath = `${PROC_PATH}/${pid}/stat`;
    const cmdlinePath = `${PROC_PATH}/${pid}/cmdline`;

    if (!fs.existsSync(statusPath)) return null;

    const status = fs.readFileSync(statusPath, "utf8");
    const stat = fs.readFileSync(statPath, "utf8");

    // Parse status file
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

    // Parse stat file for CPU times
    const statParts = stat.split(" ");
    const utime = parseInt(statParts[13], 10) || 0; // User mode jiffies
    const stime = parseInt(statParts[14], 10) || 0; // Kernel mode jiffies

    // Try to get command
    let command = name;
    try {
      if (fs.existsSync(cmdlinePath)) {
        const cmdline = fs.readFileSync(cmdlinePath, "utf8");
        command = cmdline.replace(/\0/g, " ").trim() || name;
      }
    } catch (e) {
      // Ignore cmdline read errors
    }

    // Get username from uid
    let user = uid;
    try {
      const passwd = fs.readFileSync("/etc/passwd", "utf8");
      const userMatch = passwd
        .split("\n")
        .find((line) => line.split(":")[2] === uid);
      if (userMatch) user = userMatch.split(":")[0];
    } catch (e) {
      // Keep uid as fallback
    }

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

// Store previous CPU times for calculating usage
let prevCpuTimes = {};
let prevSystemTime = 0;

// Get running processes with resource usage
router.get("/processes", async (req, res) => {
  console.log("=== Process endpoint called ===");
  try {
    // Get total memory
    const mem = await si.mem();
    const totalMemKB = mem.total / 1024;

    // Read system CPU time from host's /proc
    const cpuStatRaw = fs.readFileSync(`${PROC_PATH}/stat`, "utf8");
    const cpuLine = cpuStatRaw.split("\n")[0];
    const cpuParts = cpuLine.split(/\s+/).slice(1).map(Number);
    const currentSystemTime = cpuParts.reduce((a, b) => a + b, 0);
    const systemTimeDelta = currentSystemTime - prevSystemTime;

    // Get all PIDs from host's /proc
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

        // Count states
        if (proc.state === "R") running++;
        else if (proc.state === "S" || proc.state === "I") sleeping++;
        else if (proc.state === "D") blocked++;

        // Calculate CPU percentage
        const totalProcTime = proc.utime + proc.stime;
        const prevTime = prevCpuTimes[proc.pid] || totalProcTime;
        const procTimeDelta = totalProcTime - prevTime;

        // Store current time for next calculation
        prevCpuTimes[proc.pid] = totalProcTime;

        // CPU percentage = (process time delta / system time delta) * 100 * num_cpus
        const numCpus = require("os").cpus().length;
        const cpuPercent =
          systemTimeDelta > 0
            ? (procTimeDelta / systemTimeDelta) * 100 * numCpus
            : 0;

        // Memory percentage
        const memPercent =
          totalMemKB > 0 ? (proc.memRssKB / totalMemKB) * 100 : 0;
        const memRssMB = proc.memRssKB / 1024;

        return {
          pid: proc.pid,
          name: proc.name,
          cpu: Math.min(cpuPercent, 100), // Cap at 100%
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
      .sort((a, b) => b.memRss - a.memRss);

    // Update previous system time
    prevSystemTime = currentSystemTime;

    // Clean up old PIDs from prevCpuTimes
    const currentPids = new Set(processList.map((p) => p.pid));
    Object.keys(prevCpuTimes).forEach((pid) => {
      if (!currentPids.has(parseInt(pid, 10))) {
        delete prevCpuTimes[pid];
      }
    });

    console.log(
      `Read ${processList.length} processes from /proc, total RAM: ${(
        totalMemKB / 1024
      ).toFixed(0)} MB`
    );
    console.log(
      `Top 3 by memory:`,
      processList
        .slice(0, 3)
        .map(
          (p) =>
            `${p.name}: CPU ${p.cpu.toFixed(1)}%, MEM ${p.mem.toFixed(
              1
            )}% (${p.memRssMB.toFixed(1)} MB)`
        )
    );

    res.json({
      all: processList.length,
      running,
      blocked,
      sleeping,
      list: processList.slice(0, 150),
    });
  } catch (error) {
    console.error("Processes error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      error: "Failed to fetch processes",
      message: error.message,
    });
  }
});

module.exports = router;
