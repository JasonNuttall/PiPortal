/**
 * Collector registry.
 *
 * Every source of local data is declared once here with the TTL its value
 * stays useful for. Both the REST routes and the WebSocket push loop read
 * through this registry, so a metric is computed at most once per TTL window
 * no matter how many consumers want it.
 *
 * Channel names here are node-local. The hub prefixes them with
 * `node:<id>:` when it rebroadcasts to browsers.
 */
const config = require("../config");
const { cache } = require("./cache");
const { collectSystem } = require("./system");
const { collectTemperature } = require("./temperature");
const { collectNetwork } = require("./network");
const { collectDisk } = require("./disk");
const { collectProcesses } = require("./processes");
const dockerCollector = require("./docker");

/**
 * ttl:      how long a collected value may be reused
 * interval: how often the push loop re-collects while someone is subscribed
 * threshold: fractional change required to rebroadcast (null = any change)
 */
const CHANNELS = {
  "metrics:system": {
    ttl: 1000,
    interval: 2000,
    threshold: 0.05,
    collect: () => collectSystem(),
  },
  "metrics:temperature": {
    ttl: 2000,
    interval: 5000,
    threshold: null,
    collect: () => collectTemperature(),
  },
  "metrics:network": {
    ttl: 500,
    interval: 1000,
    threshold: 0.1,
    collect: () => collectNetwork(),
  },
  "metrics:disk": {
    ttl: 5000,
    interval: 10000,
    threshold: 0.01,
    collect: () => collectDisk(),
  },
  "metrics:processes": {
    ttl: 1000,
    interval: 2000,
    threshold: null,
    collect: () =>
      collectProcesses({
        procPath: config.hostProc,
        limit: config.processLimit,
      }),
  },
  "docker:containers": {
    ttl: 2000,
    interval: 5000,
    threshold: null,
    collect: () => dockerCollector.collectContainers(),
  },
  "docker:info": {
    ttl: 5000,
    interval: 10000,
    threshold: null,
    collect: () => dockerCollector.collectDockerInfo(),
  },
};

const CHANNEL_NAMES = Object.keys(CHANNELS);

const isValidChannel = (channel) =>
  Object.prototype.hasOwnProperty.call(CHANNELS, channel);

/**
 * Collect a channel's data, reusing a cached or in-flight value when possible.
 * @param {string} channel
 * @param {{fresh?: boolean}} [options] - fresh bypasses the TTL
 */
const collect = async (channel, { fresh = false } = {}) => {
  const spec = CHANNELS[channel];
  if (!spec) throw new Error(`Unknown channel: ${channel}`);
  return cache.get(channel, fresh ? 0 : spec.ttl, spec.collect);
};

/** Last collected value for a channel without triggering work. */
const peek = (channel) => cache.peek(channel);

/**
 * Compact per-node health line used by the fleet overview.
 * Built from the same cached values the detail panels use, so showing the
 * overview costs nothing beyond what is already being collected.
 */
const collectSummary = async () => {
  const [system, temperature, disks, dockerInfo, network] = await Promise.all([
    collect("metrics:system").catch(() => null),
    collect("metrics:temperature").catch(() => null),
    collect("metrics:disk").catch(() => null),
    collect("docker:info").catch(() => null),
    collect("metrics:network").catch(() => null),
  ]);

  // Throughput on the default interface, falling back to the busiest one.
  const stats = Array.isArray(network?.stats) ? network.stats : [];
  const primary =
    stats.find((s) => s.interface === network?.defaultInterface) ??
    stats.reduce(
      (best, s) =>
        !best || s.rx_sec + s.tx_sec > best.rx_sec + best.tx_sec ? s : best,
      null
    );

  const rootDisk =
    Array.isArray(disks) && disks.length
      ? disks.find((d) => d.mount === "/") || disks[0]
      : null;

  return {
    cpuLoad: system?.cpu?.currentLoad ?? null,
    cpuBrand: system?.cpu?.brand ?? null,
    cores: system?.cpu?.cores ?? null,
    memoryUsedPercentage: system?.memory?.usedPercentage ?? null,
    memoryTotal: system?.memory?.total ?? null,
    memoryUsed: system?.memory?.used ?? null,
    temperature: temperature?.cpu ?? null,
    temperatureSensor: temperature?.sensor ?? null,
    diskUsedPercentage: rootDisk?.use ?? null,
    diskTotal: rootDisk?.size ?? null,
    diskMount: rootDisk?.mount ?? null,
    rxSec: primary?.rx_sec ?? null,
    txSec: primary?.tx_sec ?? null,
    networkInterface: primary?.interface ?? null,
    uptime: system?.uptime ?? null,
    containersRunning: dockerInfo?.containersRunning ?? null,
    containersTotal:
      dockerInfo == null
        ? null
        : (dockerInfo.containersRunning ?? 0) +
          (dockerInfo.containersPaused ?? 0) +
          (dockerInfo.containersStopped ?? 0),
    timestamp: Date.now(),
  };
};

// The summary is itself a channel, declared after collectSummary is defined.
CHANNELS.summary = {
  ttl: 1000,
  interval: 2000,
  threshold: 0.02,
  collect: () => collectSummary(),
};
CHANNEL_NAMES.push("summary");

const start = () => dockerCollector.start();
const stop = () => dockerCollector.stop();

module.exports = {
  CHANNELS,
  CHANNEL_NAMES,
  isValidChannel,
  collect,
  peek,
  collectSummary,
  start,
  stop,
};
