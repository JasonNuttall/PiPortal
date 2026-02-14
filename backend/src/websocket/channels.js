/**
 * Channel Configuration and Data Fetchers for WebSocket
 */
const si = require("systeminformation");
const logger = require("../utils/logger");
const fs = require("fs");
const Docker = require("dockerode");
const ServiceModel = require("../db/models");
const { getHostDiskInfo } = require("../utils/hostDiskInfo");
const { getProcessList } = require("../utils/processMonitor");
const { getNetworkData } = require("../utils/networkMonitor");

// Initialize Docker client
const docker = new Docker({ socketPath: "/var/run/docker.sock" });

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
    return await getNetworkData();
  },

  "metrics:disk:detailed": async () => {
    return await getHostDiskInfo();
  },

  "metrics:processes": async () => {
    return await getProcessList();
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
      logger.error({ err: error }, "Docker containers fetch error");
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
      logger.error({ err: error }, "Docker info fetch error");
      return null;
    }
  },

  services: async () => {
    try {
      return ServiceModel.getAll();
    } catch (error) {
      logger.error({ err: error }, "Services fetch error");
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
