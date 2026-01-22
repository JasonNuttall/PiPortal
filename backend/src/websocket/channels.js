/**
 * Channel Configuration and Data Fetchers for WebSocket
 */
const si = require("systeminformation");
const fs = require("fs");
const Docker = require("dockerode");
const ServiceModel = require("../db/models");

// Initialize Docker client
const docker = new Docker({ socketPath: "/var/run/docker.sock" });

// Use HOST_PROC env var if set (for Docker), otherwise use /proc
const PROC_PATH = process.env.HOST_PROC || "/proc";

// Cache for uid to username mapping
let uidCache = {};
let uidCacheTime = 0;
const UID_CACHE_TTL = 60000;

// Store previous CPU times for process calculations
let prevCpuTimes = {};
let prevSystemTime = 0;
const numCpus = require("os").cpus().length;

/**
 * Channel configuration
 * - interval: How often to push data (ms)
 * - threshold: Change threshold for significant updates (null = any change)
 */
const CHANNEL_CONFIG = {
  "metrics:system": { interval: 2000, threshold: 0.05 },
  "metrics:temperature": { interval: 5000, threshold: null },
  "metrics:network": { interval: 1000, threshold: 0.1 },
  "metrics:disk:detailed": { interval: 10000, threshold: 0.01 },
  "metrics:processes": { interval: 2000, threshold: null },
  "docker:containers": { interval: 5000, threshold: null },
  "docker:info": { interval: 5000, threshold: null },
  services: { interval: 30000, threshold: null },
};

// Helper functions
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
      // Ignore
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
 * Data fetching functions for each channel
 */
const dataFetchers = {
  "metrics:system": async () => {
    const [cpu, mem, currentLoad, time] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.currentLoad(),
      si.time(),
    ]);

    return {
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
    };
  },

  "metrics:temperature": async () => {
    let cpuTemp = null;
    const tempPath = "/sys/class/thermal/thermal_zone0/temp";

    if (fs.existsSync(tempPath)) {
      const tempRaw = fs.readFileSync(tempPath, "utf8");
      cpuTemp = (parseInt(tempRaw) / 1000).toFixed(1);
    } else {
      const temp = await si.cpuTemperature();
      cpuTemp = temp.main ? temp.main.toFixed(1) : null;
    }

    return {
      cpu: cpuTemp,
      unit: "C",
    };
  },

  "metrics:network": async () => {
    const [interfaces, defaultInterface] = await Promise.all([
      si.networkInterfaces(),
      si.networkInterfaceDefault(),
    ]);

    const stats = await si.networkStats("*");

    const activeInterfaces = interfaces.filter(
      (iface) =>
        iface.iface !== "lo" &&
        iface.iface !== "lo0" &&
        !iface.iface.startsWith("veth") &&
        !iface.iface.startsWith("br-") &&
        !iface.iface.startsWith("docker")
    );

    const activeStats = stats.filter(
      (stat) =>
        stat.iface !== "lo" &&
        stat.iface !== "lo0" &&
        !stat.iface.startsWith("veth") &&
        !stat.iface.startsWith("br-") &&
        !stat.iface.startsWith("docker")
    );

    return {
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
    };
  },

  "metrics:disk:detailed": async () => {
    const fsSize = await si.fsSize();

    const seenFilesystems = new Set();
    const uniqueDisks = fsSize.filter((disk) => {
      if (seenFilesystems.has(disk.fs)) return false;

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

    return uniqueDisks.map((disk) => ({
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
  },

  "metrics:processes": async () => {
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
  },

  "docker:containers": async () => {
    try {
      const containers = await docker.listContainers({ all: true });

      return containers.map((container) => ({
        id: container.Id.substring(0, 12),
        name: container.Names[0].replace("/", ""),
        image: container.Image,
        state: container.State,
        status: container.Status,
        created: container.Created,
        ports: container.Ports.map((p) => ({
          private: p.PrivatePort,
          public: p.PublicPort,
          type: p.Type,
        })),
      }));
    } catch (error) {
      console.error("Docker containers fetch error:", error.message);
      return [];
    }
  },

  "docker:info": async () => {
    try {
      const info = await docker.info();
      return {
        containersRunning: info.ContainersRunning,
        containersPaused: info.ContainersPaused,
        containersStopped: info.ContainersStopped,
        images: info.Images,
        serverVersion: info.ServerVersion,
      };
    } catch (error) {
      console.error("Docker info fetch error:", error.message);
      return null;
    }
  },

  services: async () => {
    try {
      return ServiceModel.getAll();
    } catch (error) {
      console.error("Services fetch error:", error.message);
      return [];
    }
  },
};

/**
 * Fetch data for a specific channel
 */
const fetchChannelData = async (channel) => {
  const fetcher = dataFetchers[channel];
  if (!fetcher) {
    throw new Error(`Unknown channel: ${channel}`);
  }
  return await fetcher();
};

/**
 * Get all available channel names
 */
const getChannelNames = () => Object.keys(CHANNEL_CONFIG);

/**
 * Get configuration for a specific channel
 */
const getChannelConfig = (channel) => CHANNEL_CONFIG[channel];

module.exports = {
  CHANNEL_CONFIG,
  fetchChannelData,
  getChannelNames,
  getChannelConfig,
};
