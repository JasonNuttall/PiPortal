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
        used: mem.used,
        usedPercentage: ((mem.used / mem.total) * 100).toFixed(2),
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

module.exports = router;
