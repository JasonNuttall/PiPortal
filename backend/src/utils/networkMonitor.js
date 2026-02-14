/**
 * Shared network monitoring utility
 * Used by both REST API (metrics.js) and WebSocket (channels.js)
 */
const si = require("systeminformation");

const EXCLUDED_PREFIXES = ["veth", "br-", "docker"];
const EXCLUDED_NAMES = ["lo", "lo0"];

const isActiveInterface = (name) =>
  !EXCLUDED_NAMES.includes(name) &&
  !EXCLUDED_PREFIXES.some((prefix) => name.startsWith(prefix));

/**
 * Fetch network interfaces and stats, filtering out loopback/Docker interfaces
 */
const getNetworkData = async () => {
  const [interfaces, defaultInterface] = await Promise.all([
    si.networkInterfaces(),
    si.networkInterfaceDefault(),
  ]);

  const stats = await si.networkStats("*");

  const activeInterfaces = interfaces.filter((iface) =>
    isActiveInterface(iface.iface)
  );

  const activeStats = stats.filter((stat) => isActiveInterface(stat.iface));

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
};

module.exports = { getNetworkData };
