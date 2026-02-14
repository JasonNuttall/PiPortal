const express = require("express");
const si = require("systeminformation");
const fs = require("fs");
const { getHostDiskInfo } = require("../utils/hostDiskInfo");
const { getProcessList } = require("../utils/processMonitor");
const { getNetworkData } = require("../utils/networkMonitor");
const router = express.Router();

// Simple cache for expensive endpoints
const cache = {
  data: {},
  timestamps: {},
  ttl: {
    processes: 1000,  // 1 second cache for processes
    network: 500,     // 0.5 second cache for network
    system: 1000,     // 1 second cache for system metrics
  },
};

const getCached = (key) => {
  const ttl = cache.ttl[key] || 1000;
  if (cache.data[key] && Date.now() - cache.timestamps[key] < ttl) {
    return cache.data[key];
  }
  return null;
};

const setCache = (key, data) => {
  cache.data[key] = data;
  cache.timestamps[key] = Date.now();
};

// Get system metrics (CPU, RAM, etc.)
router.get("/system", async (req, res) => {
  try {
    // Check cache first
    const cached = getCached("system");
    if (cached) {
      return res.json(cached);
    }

    const [cpu, mem, currentLoad, time] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.currentLoad(),
      si.time(),
    ]);

    const result = {
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

    setCache("system", result);
    res.json(result);
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
    const disks = await getHostDiskInfo();
    const mainDisk = disks.find((d) => d.mount === "/") || disks[0];

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
    const diskInfo = await getHostDiskInfo();
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
    const data = await getNetworkData();
    res.json(data);
  } catch (error) {
    console.error("Network metrics error:", error.message);
    res.status(500).json({
      error: "Failed to fetch network metrics",
      message: error.message,
    });
  }
});

// Get running processes with resource usage
router.get("/processes", async (req, res) => {
  try {
    const data = await getProcessList();
    res.json(data);
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
