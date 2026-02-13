// globals: true in vitest config provides describe, it, expect, etc.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const ChangeDetector = require("../ChangeDetector");

let detector;

beforeEach(() => {
  detector = new ChangeDetector();
});

describe("ChangeDetector", () => {
  describe("hasSignificantChange", () => {
    it("returns true for first data (no previous)", () => {
      const result = detector.hasSignificantChange("metrics:system", { cpu: { currentLoad: 50 } }, 0.05);
      expect(result).toBe(true);
    });

    it("stores data after first call", () => {
      detector.hasSignificantChange("metrics:system", { cpu: { currentLoad: 50 } }, 0.05);
      const result = detector.hasSignificantChange("metrics:system", { cpu: { currentLoad: 50 } }, 0.05);
      expect(result).toBe(false);
    });

    it("updates stored data when change is significant", () => {
      detector.hasSignificantChange("metrics:system", { cpu: { currentLoad: 10 } }, 0.05);
      const result = detector.hasSignificantChange("metrics:system", { cpu: { currentLoad: 25 } }, 0.05);
      expect(result).toBe(true);
    });
  });

  describe("compareSystemMetrics", () => {
    it("returns false when CPU change is below threshold", () => {
      detector.hasSignificantChange("metrics:system", {
        cpu: { currentLoad: "50.0" },
        memory: { usedPercentage: "60.0" },
      }, 0.05);

      const result = detector.hasSignificantChange("metrics:system", {
        cpu: { currentLoad: "52.0" },
        memory: { usedPercentage: "60.0" },
      }, 0.05);

      expect(result).toBe(false);
    });

    it("returns true when CPU change exceeds threshold", () => {
      detector.hasSignificantChange("metrics:system", {
        cpu: { currentLoad: "50.0" },
        memory: { usedPercentage: "60.0" },
      }, 0.05);

      const result = detector.hasSignificantChange("metrics:system", {
        cpu: { currentLoad: "60.0" },
        memory: { usedPercentage: "60.0" },
      }, 0.05);

      expect(result).toBe(true);
    });

    it("returns true when memory change exceeds threshold", () => {
      detector.hasSignificantChange("metrics:system", {
        cpu: { currentLoad: "50.0" },
        memory: { usedPercentage: "50.0" },
      }, 0.05);

      const result = detector.hasSignificantChange("metrics:system", {
        cpu: { currentLoad: "50.0" },
        memory: { usedPercentage: "60.0" },
      }, 0.05);

      expect(result).toBe(true);
    });

    it("returns true when prev cpu is missing", () => {
      detector.hasSignificantChange("metrics:system", { memory: {} }, 0.05);
      const result = detector.hasSignificantChange("metrics:system", {
        cpu: { currentLoad: "50" },
      }, 0.05);
      expect(result).toBe(true);
    });
  });

  describe("compareNetworkMetrics", () => {
    it("returns false when speeds unchanged", () => {
      const data = { stats: [{ interface: "eth0", rx_sec: 1000, tx_sec: 500 }] };
      detector.hasSignificantChange("metrics:network", data, 0.1);

      const result = detector.hasSignificantChange("metrics:network", data, 0.1);
      expect(result).toBe(false);
    });

    it("returns true when speed starts from zero", () => {
      detector.hasSignificantChange("metrics:network", {
        stats: [{ interface: "eth0", rx_sec: 0, tx_sec: 0 }],
      }, 0.1);

      const result = detector.hasSignificantChange("metrics:network", {
        stats: [{ interface: "eth0", rx_sec: 100, tx_sec: 0 }],
      }, 0.1);

      expect(result).toBe(true);
    });

    it("returns true when speed change exceeds threshold", () => {
      detector.hasSignificantChange("metrics:network", {
        stats: [{ interface: "eth0", rx_sec: 1000, tx_sec: 0 }],
      }, 0.1);

      const result = detector.hasSignificantChange("metrics:network", {
        stats: [{ interface: "eth0", rx_sec: 2000, tx_sec: 0 }],
      }, 0.1);

      expect(result).toBe(true);
    });

    it("returns true when stats array is missing", () => {
      detector.hasSignificantChange("metrics:network", {}, 0.1);
      const result = detector.hasSignificantChange("metrics:network", { stats: [] }, 0.1);
      expect(result).toBe(true);
    });
  });

  describe("compareProcesses", () => {
    it("returns true when top process CPU changes significantly", () => {
      const result = detector.compare("metrics:processes",
        { list: [{ pid: 1, cpu: 10, name: "test" }] },
        { list: [{ pid: 1, cpu: 20, name: "test" }] },
        0.05
      );
      expect(result).toBe(true);
    });

    it("returns false when process list is unchanged", () => {
      const list = [{ pid: 1, cpu: 10, name: "a" }, { pid: 2, cpu: 5, name: "b" }];
      const result = detector.compare("metrics:processes",
        { list },
        { list: [...list] },
        0.05
      );
      expect(result).toBe(false);
    });

    it("returns true when top PIDs change", () => {
      const result = detector.compare("metrics:processes",
        { list: [{ pid: 1, cpu: 10 }, { pid: 2, cpu: 8 }] },
        { list: [{ pid: 3, cpu: 15 }, { pid: 2, cpu: 8 }] },
        0.05
      );
      expect(result).toBe(true);
    });
  });

  describe("compareDockerContainers", () => {
    it("returns true when container count changes", () => {
      const result = detector.compare("docker:containers",
        [{ id: "abc", state: "running" }],
        [{ id: "abc", state: "running" }, { id: "def", state: "running" }],
        0.05
      );
      expect(result).toBe(true);
    });

    it("returns true when container state changes", () => {
      const result = detector.compare("docker:containers",
        [{ id: "abc", state: "running" }],
        [{ id: "abc", state: "exited" }],
        0.05
      );
      expect(result).toBe(true);
    });

    it("returns false when containers unchanged", () => {
      const containers = [{ id: "abc", state: "running" }, { id: "def", state: "exited" }];
      const result = detector.compare("docker:containers", containers, [...containers], 0.05);
      expect(result).toBe(false);
    });
  });

  describe("compareDiskMetrics", () => {
    it("returns true when disk count changes", () => {
      const result = detector.compare("metrics:disk:detailed",
        [{ mount: "/", use: 50 }],
        [{ mount: "/", use: 50 }, { mount: "/home", use: 30 }],
        0.05
      );
      expect(result).toBe(true);
    });

    it("returns false when usage within threshold", () => {
      const result = detector.compare("metrics:disk:detailed",
        [{ mount: "/", use: 50 }],
        [{ mount: "/", use: 52 }],
        0.05
      );
      expect(result).toBe(false);
    });

    it("returns true when usage exceeds threshold", () => {
      const result = detector.compare("metrics:disk:detailed",
        [{ mount: "/", use: 50 }],
        [{ mount: "/", use: 60 }],
        0.05
      );
      expect(result).toBe(true);
    });
  });

  describe("clear", () => {
    it("clears specific channel", () => {
      detector.hasSignificantChange("metrics:system", { cpu: { currentLoad: 50 } }, 0.05);
      detector.clear("metrics:system");
      const result = detector.hasSignificantChange("metrics:system", { cpu: { currentLoad: 50 } }, 0.05);
      expect(result).toBe(true);
    });

    it("clears all channels when no argument", () => {
      detector.hasSignificantChange("metrics:system", { test: 1 }, 0.05);
      detector.hasSignificantChange("metrics:network", { test: 2 }, 0.05);
      detector.clear();
      expect(detector.previousValues.size).toBe(0);
    });
  });

  describe("cloneData", () => {
    it("creates a deep copy", () => {
      const original = { a: { b: [1, 2, 3] } };
      const clone = detector.cloneData(original);
      expect(clone).toEqual(original);
      expect(clone).not.toBe(original);
      expect(clone.a).not.toBe(original.a);
    });
  });

  describe("compare with null threshold", () => {
    it("returns false for identical data", () => {
      const result = detector.compare("unknown:channel", { a: 1 }, { a: 1 }, null);
      expect(result).toBe(false);
    });

    it("returns true for different data", () => {
      const result = detector.compare("unknown:channel", { a: 1 }, { a: 2 }, null);
      expect(result).toBe(true);
    });
  });
});
