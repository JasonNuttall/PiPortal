/**
 * Suppresses WebSocket pushes when nothing meaningful changed.
 *
 * Two things were wrong with the previous version:
 *
 *  1. compare() returned the JSON.stringify deep-comparison whenever the
 *     threshold was null, *before* reaching the per-channel switch. Since
 *     metrics:processes and docker:containers are both configured with a null
 *     threshold, compareProcesses() and compareDockerContainers() were
 *     unreachable. Process CPU values are floats that differ on every sample,
 *     so the check always reported "changed" and the full list was pushed every
 *     two seconds regardless. The unit tests missed it because they call
 *     compare() directly with a numeric threshold, which skips the early return.
 *
 *  2. Both the comparison and the retained copy ran JSON.stringify /
 *     JSON.parse over the entire payload — a 150-process array, several times
 *     per second.
 *
 * Each channel now declares a projection: the few values that decide whether a
 * push is warranted. Comparison and retained state both work on that
 * projection, so the cost no longer scales with payload size.
 */

const num = (value) => {
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

/** Relative change between two numbers, treating 0 -> non-zero as total. */
const relativeChange = (prev, curr) => {
  if (prev === curr) return 0;
  if (prev === 0) return curr === 0 ? 0 : Infinity;
  return Math.abs((curr - prev) / prev);
};

/**
 * channel -> { project, compare }
 * project: raw payload  -> minimal comparison state
 * compare: (prevProjection, currProjection, threshold) -> boolean
 */
const CHANNEL_COMPARATORS = {
  "metrics:system": {
    project: (data) => ({
      cpu: num(data?.cpu?.currentLoad),
      mem: num(data?.memory?.usedPercentage),
      hasCpu: Boolean(data?.cpu),
    }),
    // Thresholds are fractional (0.05), the values are percentages.
    compare: (prev, curr, threshold) => {
      if (!prev.hasCpu || !curr.hasCpu) return true;
      const limit = num(threshold) * 100;
      return (
        Math.abs(prev.cpu - curr.cpu) > limit ||
        Math.abs(prev.mem - curr.mem) > limit
      );
    },
  },

  "metrics:temperature": {
    project: (data) => ({ cpu: data?.cpu === null ? null : num(data?.cpu) }),
    // Sub-degree jitter is not worth a round trip.
    compare: (prev, curr) => {
      if (prev.cpu === null || curr.cpu === null) return prev.cpu !== curr.cpu;
      return Math.abs(prev.cpu - curr.cpu) >= 0.5;
    },
  },

  "metrics:network": {
    project: (data) =>
      Array.isArray(data?.stats)
        ? data.stats.map((s) => ({
            interface: s.interface,
            speed: num(s.rx_sec) + num(s.tx_sec),
          }))
        : null,
    compare: (prev, curr, threshold) => {
      if (!prev || !curr) return true;
      if (prev.length !== curr.length) return true;
      for (let i = 0; i < curr.length; i++) {
        if (prev[i].interface !== curr[i].interface) return true;
        if (relativeChange(prev[i].speed, curr[i].speed) > num(threshold)) {
          return true;
        }
      }
      return false;
    },
  },

  "metrics:processes": {
    project: (data) => {
      const list = Array.isArray(data?.list) ? data.list : null;
      if (!list) return null;
      return {
        count: list.length,
        // The panel is sorted by memory, so the identity and load of the
        // leading rows is what a viewer actually perceives changing.
        top: list.slice(0, 5).map((p) => ({ pid: p.pid, cpu: num(p.cpu) })),
      };
    },
    compare: (prev, curr) => {
      if (!prev || !curr) return true;
      if (prev.top.length !== curr.top.length) return true;
      for (let i = 0; i < curr.top.length; i++) {
        if (prev.top[i].pid !== curr.top[i].pid) return true;
        if (Math.abs(prev.top[i].cpu - curr.top[i].cpu) > 5) return true;
      }
      return false;
    },
  },

  "metrics:disk": {
    project: (data) =>
      Array.isArray(data)
        ? data.map((d) => ({
            mount: d.mount,
            use: num(d.use ?? d.usedPercentage),
          }))
        : null,
    compare: (prev, curr, threshold) => {
      if (!prev || !curr) return true;
      if (prev.length !== curr.length) return true;
      for (let i = 0; i < curr.length; i++) {
        if (prev[i].mount !== curr[i].mount) return true;
        if (Math.abs(prev[i].use - curr[i].use) > num(threshold) * 100) {
          return true;
        }
      }
      return false;
    },
  },

  "docker:containers": {
    project: (data) =>
      Array.isArray(data)
        ? data
            .map((c) => `${c.id}:${c.state}`)
            .sort()
            .join(",")
        : null,
    compare: (prev, curr) => prev !== curr,
  },

  /**
   * The overview strip. describe() carries a lastSeen timestamp that moves on
   * every sample, so comparing the raw payload would push on every tick and
   * defeat the point of change detection.
   */
  fleet: {
    project: (data) =>
      Array.isArray(data)
        ? data.map((node) => ({
            id: node.id,
            name: node.name,
            status: node.status,
            // Whole units are all the strip renders.
            cpu: Math.round(num(node.summary?.cpuLoad)),
            mem: Math.round(num(node.summary?.memoryUsedPercentage)),
            temp: Math.round(num(node.summary?.temperature)),
            disk: Math.round(num(node.summary?.diskUsedPercentage)),
            containers: num(node.summary?.containersRunning),
            // Rounded to KB/s so byte-level jitter does not trigger a push.
            rx: Math.round(num(node.summary?.rxSec) / 1024),
            tx: Math.round(num(node.summary?.txSec) / 1024),
            hasSummary: node.summary != null,
          }))
        : null,
    compare: (prev, curr) => {
      if (!prev || !curr) return true;
      if (prev.length !== curr.length) return true;
      for (let i = 0; i < curr.length; i++) {
        const a = prev[i];
        const b = curr[i];
        for (const key of Object.keys(b)) {
          if (a[key] !== b[key]) return true;
        }
      }
      return false;
    },
  },

  summary: {
    project: (data) => ({
      cpu: num(data?.cpuLoad),
      mem: num(data?.memoryUsedPercentage),
      temp: num(data?.temperature),
      disk: num(data?.diskUsedPercentage),
      containers: num(data?.containersRunning),
      rx: num(data?.rxSec),
      tx: num(data?.txSec),
    }),
    compare: (prev, curr, threshold) => {
      const limit = num(threshold) * 100;
      return (
        Math.abs(prev.cpu - curr.cpu) > limit ||
        Math.abs(prev.mem - curr.mem) > limit ||
        Math.abs(prev.temp - curr.temp) >= 0.5 ||
        Math.abs(prev.disk - curr.disk) > limit ||
        prev.containers !== curr.containers ||
        // Throughput is bursty; compare relatively so idle links stay quiet.
        relativeChange(prev.rx, curr.rx) > 0.2 ||
        relativeChange(prev.tx, curr.tx) > 0.2
      );
    },
  },
};

/** Strip the `node:<id>:` prefix the hub adds before rebroadcasting. */
const baseChannel = (channel) => {
  const match = /^node:[^:]+:(.+)$/.exec(channel);
  return match ? match[1] : channel;
};

class ChangeDetector {
  constructor() {
    /** channel -> projected previous state */
    this.previousValues = new Map();
  }

  /** Reduce a payload to the state its comparator needs. */
  project(channel, data) {
    const comparator = CHANNEL_COMPARATORS[baseChannel(channel)];
    return comparator ? comparator.project(data) : data;
  }

  /**
   * @param {string} channel
   * @param {*} newData
   * @param {number|null} threshold
   * @returns {boolean} whether subscribers should be sent this payload
   */
  hasSignificantChange(channel, newData, threshold) {
    const projection = this.project(channel, newData);
    const prev = this.previousValues.get(channel);

    if (prev === undefined) {
      this.previousValues.set(channel, projection);
      return true;
    }

    const changed = this.compareProjections(
      channel,
      prev,
      projection,
      threshold
    );
    if (changed) {
      this.previousValues.set(channel, projection);
    }
    return changed;
  }

  /**
   * Compare two raw payloads. Retained for direct use and testing.
   */
  compare(channel, prev, curr, threshold) {
    return this.compareProjections(
      channel,
      this.project(channel, prev),
      this.project(channel, curr),
      threshold
    );
  }

  compareProjections(channel, prev, curr, threshold) {
    const comparator = CHANNEL_COMPARATORS[baseChannel(channel)];
    if (comparator) {
      return comparator.compare(prev, curr, threshold);
    }
    // No projection for this channel: fall back to a structural comparison.
    // Only reached for small payloads such as docker:info.
    return JSON.stringify(prev) !== JSON.stringify(curr);
  }

  clear(channel) {
    if (channel) {
      this.previousValues.delete(channel);
    } else {
      this.previousValues.clear();
    }
  }
}

module.exports = ChangeDetector;
module.exports.CHANNEL_COMPARATORS = CHANNEL_COMPARATORS;
module.exports.baseChannel = baseChannel;
