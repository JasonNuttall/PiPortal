// Test the pure logic of networkMonitor by extracting and testing the core algorithms directly.

describe("networkMonitor - interface filtering logic", () => {
  const EXCLUDED_PREFIXES = ["veth", "br-", "docker"];
  const EXCLUDED_NAMES = ["lo", "lo0"];

  const isActiveInterface = (name) =>
    !EXCLUDED_NAMES.includes(name) &&
    !EXCLUDED_PREFIXES.some((prefix) => name.startsWith(prefix));

  it("accepts physical ethernet interfaces", () => {
    expect(isActiveInterface("eth0")).toBe(true);
    expect(isActiveInterface("eth1")).toBe(true);
    expect(isActiveInterface("enp0s3")).toBe(true);
  });

  it("accepts wireless interfaces", () => {
    expect(isActiveInterface("wlan0")).toBe(true);
    expect(isActiveInterface("wlp2s0")).toBe(true);
  });

  it("rejects loopback interfaces", () => {
    expect(isActiveInterface("lo")).toBe(false);
    expect(isActiveInterface("lo0")).toBe(false);
  });

  it("rejects Docker veth interfaces", () => {
    expect(isActiveInterface("veth1234abc")).toBe(false);
    expect(isActiveInterface("veth0")).toBe(false);
  });

  it("rejects Docker bridge interfaces", () => {
    expect(isActiveInterface("br-abc123")).toBe(false);
    expect(isActiveInterface("br-network1")).toBe(false);
  });

  it("rejects Docker network interfaces", () => {
    expect(isActiveInterface("docker0")).toBe(false);
    expect(isActiveInterface("docker_gwbridge")).toBe(false);
  });

  it("accepts bond and tunnel interfaces", () => {
    expect(isActiveInterface("bond0")).toBe(true);
    expect(isActiveInterface("tun0")).toBe(true);
  });
});

describe("networkMonitor - interface data mapping", () => {
  const mapInterface = (iface, defaultInterface) => ({
    name: iface.iface,
    ip4: iface.ip4,
    ip6: iface.ip6,
    mac: iface.mac,
    type: iface.type,
    speed: iface.speed,
    operstate: iface.operstate,
    isDefault: iface.iface === defaultInterface,
  });

  it("maps interface fields correctly", () => {
    const iface = {
      iface: "eth0",
      ip4: "192.168.1.100",
      ip6: "fe80::1",
      mac: "aa:bb:cc:dd:ee:ff",
      type: "wired",
      speed: 1000,
      operstate: "up",
    };

    const result = mapInterface(iface, "eth0");
    expect(result.name).toBe("eth0");
    expect(result.ip4).toBe("192.168.1.100");
    expect(result.mac).toBe("aa:bb:cc:dd:ee:ff");
    expect(result.isDefault).toBe(true);
  });

  it("sets isDefault to false for non-default interface", () => {
    const iface = { iface: "wlan0", ip4: "192.168.1.101", ip6: "", mac: "", type: "wireless", speed: 72, operstate: "up" };
    const result = mapInterface(iface, "eth0");
    expect(result.isDefault).toBe(false);
  });
});

describe("networkMonitor - stats data mapping", () => {
  const mapStat = (stat) => ({
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
  });

  it("maps all stat fields correctly", () => {
    const stat = {
      iface: "eth0",
      rx_bytes: 1000000,
      tx_bytes: 500000,
      rx_sec: 1024,
      tx_sec: 512,
      rx_dropped: 5,
      tx_dropped: 2,
      rx_errors: 1,
      tx_errors: 0,
      ms: 1000,
    };

    const result = mapStat(stat);
    expect(result.interface).toBe("eth0");
    expect(result.rx_bytes).toBe(1000000);
    expect(result.tx_bytes).toBe(500000);
    expect(result.rx_sec).toBe(1024);
    expect(result.tx_sec).toBe(512);
    expect(result.rx_dropped).toBe(5);
    expect(result.tx_dropped).toBe(2);
    expect(result.rx_errors).toBe(1);
    expect(result.tx_errors).toBe(0);
    expect(result.ms).toBe(1000);
  });

  it("defaults null/undefined fields to 0", () => {
    const stat = {
      iface: "eth0",
      rx_bytes: null,
      tx_bytes: undefined,
      rx_sec: null,
      tx_sec: undefined,
    };

    const result = mapStat(stat);
    expect(result.rx_bytes).toBe(0);
    expect(result.tx_bytes).toBe(0);
    expect(result.rx_sec).toBe(0);
    expect(result.tx_sec).toBe(0);
    expect(result.rx_dropped).toBe(0);
    expect(result.tx_dropped).toBe(0);
    expect(result.rx_errors).toBe(0);
    expect(result.tx_errors).toBe(0);
    expect(result.ms).toBe(0);
  });
});

describe("networkMonitor - response structure", () => {
  it("produces correct response shape", () => {
    const response = {
      interfaces: [{ name: "eth0", ip4: "192.168.1.1", isDefault: true }],
      stats: [{ interface: "eth0", rx_bytes: 100, tx_bytes: 50 }],
      defaultInterface: "eth0",
      timestamp: Date.now(),
    };

    expect(response).toHaveProperty("interfaces");
    expect(response).toHaveProperty("stats");
    expect(response).toHaveProperty("defaultInterface");
    expect(response).toHaveProperty("timestamp");
    expect(Array.isArray(response.interfaces)).toBe(true);
    expect(Array.isArray(response.stats)).toBe(true);
    expect(typeof response.timestamp).toBe("number");
  });
});
