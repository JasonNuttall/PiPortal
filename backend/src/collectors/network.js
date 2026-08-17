/**
 * Network interface and throughput collection.
 *
 * Interface identity (name, MAC, IPs, link speed) is effectively static, but
 * the old code re-enumerated every interface on each 1s push. Only the byte
 * counters actually need per-tick freshness, so identity is cached separately.
 */
const si = require("systeminformation");

const INTERFACE_TTL = 30000;

const EXCLUDED_PREFIXES = ["veth", "br-", "docker", "virbr", "tap", "tun", "cni"];
const EXCLUDED_NAMES = new Set(["lo", "lo0"]);

const isActiveInterface = (name) =>
  !EXCLUDED_NAMES.has(name) &&
  !EXCLUDED_PREFIXES.some((prefix) => name.startsWith(prefix));

let interfaceCache = null;
let interfaceCacheTime = 0;

const getInterfaces = async () => {
  if (interfaceCache && Date.now() - interfaceCacheTime < INTERFACE_TTL) {
    return interfaceCache;
  }

  const [interfaces, defaultInterface] = await Promise.all([
    si.networkInterfaces(),
    si.networkInterfaceDefault(),
  ]);

  interfaceCache = {
    interfaces: interfaces
      .filter((iface) => isActiveInterface(iface.iface))
      .map((iface) => ({
        name: iface.iface,
        ip4: iface.ip4,
        ip6: iface.ip6,
        mac: iface.mac,
        type: iface.type,
        speed: iface.speed,
        operstate: iface.operstate,
        isDefault: iface.iface === defaultInterface,
      })),
    defaultInterface,
  };
  interfaceCacheTime = Date.now();
  return interfaceCache;
};

const collectNetwork = async () => {
  const [{ interfaces, defaultInterface }, stats] = await Promise.all([
    getInterfaces(),
    si.networkStats("*"),
  ]);

  return {
    interfaces,
    stats: stats
      .filter((stat) => isActiveInterface(stat.iface))
      .map((stat) => ({
        interface: stat.iface,
        rx_bytes: stat.rx_bytes || 0,
        tx_bytes: stat.tx_bytes || 0,
        rx_sec: Math.max(0, stat.rx_sec || 0),
        tx_sec: Math.max(0, stat.tx_sec || 0),
        rx_dropped: stat.rx_dropped || 0,
        tx_dropped: stat.tx_dropped || 0,
        rx_errors: stat.rx_errors || 0,
        tx_errors: stat.tx_errors || 0,
        ms: stat.ms || 0,
      })),
    defaultInterface,
    timestamp: Date.now(),
  };
};

const __reset = () => {
  interfaceCache = null;
  interfaceCacheTime = 0;
};

module.exports = { collectNetwork, isActiveInterface, __reset };
