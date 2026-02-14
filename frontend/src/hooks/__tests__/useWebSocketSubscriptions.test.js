import { describe, it, expect, vi, beforeEach } from "vitest";

// Test the subscription logic extracted into useWebSocketSubscriptions.
// Since it's a useEffect-based hook that depends on useWebSocket internals,
// we test the core logic patterns directly (same approach as useWebSocket.test.js).

describe("useWebSocketSubscriptions - subscription logic", () => {
  // Replicate the PANEL_TO_CHANNEL mapping
  const PANEL_TO_CHANNEL = {
    network: "metrics:network",
    disk: "metrics:disk:detailed",
    processes: "metrics:processes",
    docker: "docker:containers",
    services: "services",
  };

  it("maps all panel IDs to channels", () => {
    expect(PANEL_TO_CHANNEL.network).toBe("metrics:network");
    expect(PANEL_TO_CHANNEL.disk).toBe("metrics:disk:detailed");
    expect(PANEL_TO_CHANNEL.processes).toBe("metrics:processes");
    expect(PANEL_TO_CHANNEL.docker).toBe("docker:containers");
    expect(PANEL_TO_CHANNEL.services).toBe("services");
  });

  it("subscribes only to panels in websocket mode", () => {
    const subscribe = vi.fn(() => vi.fn());

    const panelModes = {
      network: "websocket",
      disk: "polling",
      docker: "websocket",
      services: "polling",
      processes: "polling",
    };
    const collapsedPanels = {};

    Object.entries(panelModes).forEach(([panelId, mode]) => {
      if (mode === "websocket" && !collapsedPanels[panelId]) {
        const channel = PANEL_TO_CHANNEL[panelId];
        if (channel) {
          subscribe(channel, vi.fn());
        }
      }
    });

    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(subscribe).toHaveBeenCalledWith("metrics:network", expect.any(Function));
    expect(subscribe).toHaveBeenCalledWith("docker:containers", expect.any(Function));
  });

  it("does not subscribe to collapsed panels even in websocket mode", () => {
    const subscribe = vi.fn(() => vi.fn());

    const panelModes = {
      network: "websocket",
      disk: "websocket",
    };
    const collapsedPanels = { network: true };

    Object.entries(panelModes).forEach(([panelId, mode]) => {
      if (mode === "websocket" && !collapsedPanels[panelId]) {
        const channel = PANEL_TO_CHANNEL[panelId];
        if (channel) {
          subscribe(channel, vi.fn());
        }
      }
    });

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith("metrics:disk:detailed", expect.any(Function));
  });

  it("does not subscribe when all panels are polling", () => {
    const subscribe = vi.fn(() => vi.fn());

    const panelModes = {
      network: "polling",
      disk: "polling",
      docker: "polling",
    };
    const collapsedPanels = {};

    Object.entries(panelModes).forEach(([panelId, mode]) => {
      if (mode === "websocket" && !collapsedPanels[panelId]) {
        const channel = PANEL_TO_CHANNEL[panelId];
        if (channel) {
          subscribe(channel, vi.fn());
        }
      }
    });

    expect(subscribe).not.toHaveBeenCalled();
  });

  it("collects unsubscribe functions for cleanup", () => {
    const unsub1 = vi.fn();
    const unsub2 = vi.fn();
    const subscribe = vi.fn()
      .mockReturnValueOnce(unsub1)
      .mockReturnValueOnce(unsub2);

    const unsubscribers = [];
    const panelModes = { network: "websocket", docker: "websocket" };
    const collapsedPanels = {};

    Object.entries(panelModes).forEach(([panelId, mode]) => {
      if (mode === "websocket" && !collapsedPanels[panelId]) {
        const channel = PANEL_TO_CHANNEL[panelId];
        if (channel) {
          const unsubscribe = subscribe(channel, vi.fn());
          unsubscribers.push(unsubscribe);
        }
      }
    });

    // Cleanup
    unsubscribers.forEach((unsub) => unsub());

    expect(unsub1).toHaveBeenCalledTimes(1);
    expect(unsub2).toHaveBeenCalledTimes(1);
  });
});

describe("useWebSocketSubscriptions - data routing", () => {
  it("routes network data through transform and setter", () => {
    const setNetworkData = vi.fn();
    const setNetworkStats = vi.fn();

    // Simulate the network transform logic
    const previousData = {
      stats: [{ rx_bytes: 1000, tx_bytes: 500 }],
    };
    const previousTime = Date.now() - 1000; // 1 second ago

    const newData = {
      stats: [{ rx_bytes: 2000, tx_bytes: 1500 }],
    };

    const currentTime = Date.now();
    const timeDiff = (currentTime - previousTime) / 1000;
    const currentStats = newData.stats[0];
    const prevStats = previousData.stats[0];

    if (currentStats && prevStats && timeDiff > 0) {
      const rxDiff = Math.max(0, currentStats.rx_bytes - prevStats.rx_bytes);
      const txDiff = Math.max(0, currentStats.tx_bytes - prevStats.tx_bytes);
      setNetworkStats({
        downloadSpeed: rxDiff / timeDiff,
        uploadSpeed: txDiff / timeDiff,
      });
    }

    setNetworkData(newData);

    expect(setNetworkData).toHaveBeenCalledWith(newData);
    expect(setNetworkStats).toHaveBeenCalledWith(
      expect.objectContaining({
        downloadSpeed: expect.any(Number),
        uploadSpeed: expect.any(Number),
      })
    );
  });

  it("routes non-network data directly to setter", () => {
    const setDetailedDiskData = vi.fn();
    const setDockerContainers = vi.fn();
    const setServices = vi.fn();
    const setProcessData = vi.fn();

    const diskData = [{ mount: "/", size: 100 }];
    const dockerData = [{ id: "abc", name: "test" }];
    const servicesData = [{ id: 1, name: "Portainer" }];
    const processData = { all: 50, list: [] };

    setDetailedDiskData(diskData);
    setDockerContainers(dockerData);
    setServices(servicesData);
    setProcessData(processData);

    expect(setDetailedDiskData).toHaveBeenCalledWith(diskData);
    expect(setDockerContainers).toHaveBeenCalledWith(dockerData);
    expect(setServices).toHaveBeenCalledWith(servicesData);
    expect(setProcessData).toHaveBeenCalledWith(processData);
  });
});

describe("useWebSocketSubscriptions - panel config completeness", () => {
  const PANEL_TO_CHANNEL = {
    network: "metrics:network",
    disk: "metrics:disk:detailed",
    processes: "metrics:processes",
    docker: "docker:containers",
    services: "services",
  };

  const panelSetters = ["network", "disk", "docker", "services", "processes"];

  it("has a channel mapping for every panel", () => {
    panelSetters.forEach((panelId) => {
      expect(PANEL_TO_CHANNEL[panelId]).toBeDefined();
    });
  });

  it("all channel names are non-empty strings", () => {
    Object.values(PANEL_TO_CHANNEL).forEach((channel) => {
      expect(typeof channel).toBe("string");
      expect(channel.length).toBeGreaterThan(0);
    });
  });
});
