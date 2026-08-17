/**
 * CPU / memory / uptime collection.
 *
 * si.cpu() returns static hardware facts (manufacturer, brand, core count).
 * The old code re-queried it on every 2s push, which on a Pi meant re-reading
 * and re-parsing /proc/cpuinfo forever to learn the same answer. It is now
 * resolved once and reused.
 */
const si = require("systeminformation");

let staticCpuPromise = null;

const getStaticCpu = () => {
  if (!staticCpuPromise) {
    staticCpuPromise = si.cpu().then(
      (cpu) => ({
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        cores: cpu.cores,
        physicalCores: cpu.physicalCores,
        speed: cpu.speed,
      }),
      (err) => {
        staticCpuPromise = null; // allow a retry on the next call
        throw err;
      }
    );
  }
  return staticCpuPromise;
};

const collectSystem = async () => {
  const [staticCpu, mem, currentLoad, time] = await Promise.all([
    getStaticCpu(),
    si.mem(),
    si.currentLoad(),
    si.time(),
  ]);

  const used = mem.active || mem.used;

  return {
    cpu: {
      ...staticCpu,
      currentLoad: Number(currentLoad.currentLoad.toFixed(2)),
      avgLoad: currentLoad.avgLoad,
    },
    memory: {
      total: mem.total,
      free: mem.free,
      used,
      available: mem.available,
      usedPercentage: Number(((used / mem.total) * 100).toFixed(2)),
    },
    uptime: time.uptime,
  };
};

module.exports = { collectSystem, getStaticCpu };
