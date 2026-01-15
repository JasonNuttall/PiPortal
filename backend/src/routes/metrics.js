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
    
    const diskInfo = fsSize.map(disk => ({
      fs: disk.fs,
      type: disk.type,
      size: disk.size,
      used: disk.used,
      available: disk.available,
      use: disk.use,
      mount: disk.mount,
      sizeGB: (disk.size / (1024 ** 3)).toFixed(2),
      usedGB: (disk.used / (1024 ** 3)).toFixed(2),
      availableGB: (disk.available / (1024 ** 3)).toFixed(2)
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
    const [interfaces, stats, defaultInterface] = await Promise.all([
      si.networkInterfaces(),
      si.networkStats("*"),
      si.networkInterfaceDefault()
    ]);

    // Filter out loopback and inactive interfaces for cleaner display
    const activeInterfaces = interfaces.filter(
      iface => iface.iface !== 'lo' && 
               iface.iface !== 'lo0' && 
               !iface.iface.startsWith('veth')
    );

    res.json({
      interfaces: activeInterfaces.map(iface => ({
        name: iface.iface,
        ip4: iface.ip4,
        ip6: iface.ip6,
        mac: iface.mac,
        type: iface.type,
        speed: iface.speed,
        operstate: iface.operstate,
        isDefault: iface.iface === defaultInterface
      })),
      stats: stats
        .filter(stat => 
          stat.iface !== 'lo' && 
          stat.iface !== 'lo0' && 
          !stat.iface.startsWith('veth')
        )
        .map(stat => ({
          interface: stat.iface,
          rx_bytes: stat.rx_bytes || 0,
          tx_bytes: stat.tx_bytes || 0,
          rx_sec: stat.rx_sec || 0,
          tx_sec: stat.tx_sec || 0,
          rx_dropped: stat.rx_dropped || 0,
          tx_dropped: stat.tx_dropped || 0,
          rx_errors: stat.rx_errors || 0,
          tx_errors: stat.tx_errors || 0,
          ms: stat.ms || 0
        })),
      defaultInterface: defaultInterface
    });
  } catch (error) {
    console.error("Network metrics error:", error.message);
    res.status(500).json({
      error: "Failed to fetch network metrics",
      message: error.message,
    });
  }
});

module.exports = router;
