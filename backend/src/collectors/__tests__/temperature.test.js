// Verifies sensor discovery against fixture sysfs trees shaped like the two
// machines in the fleet: a Raspberry Pi (thermal zones) and an AMD desktop
// (hwmon only, no thermal zones at all).
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  collectTemperature,
  discoverSensors,
  parseMilliC,
  __reset,
} = require("../temperature");

let sysDir;

const writeThermalZone = (index, type, milliC) => {
  const dir = path.join(sysDir, "class", "thermal", `thermal_zone${index}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "type"), `${type}\n`);
  fs.writeFileSync(path.join(dir, "temp"), `${milliC}\n`);
};

const writeHwmon = (index, name, channels) => {
  const dir = path.join(sysDir, "class", "hwmon", `hwmon${index}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "name"), `${name}\n`);
  for (const [channel, { milliC, label }] of Object.entries(channels)) {
    fs.writeFileSync(path.join(dir, `temp${channel}_input`), `${milliC}\n`);
    if (label) {
      fs.writeFileSync(path.join(dir, `temp${channel}_label`), `${label}\n`);
    }
  }
};

beforeEach(() => {
  __reset();
  sysDir = fs.mkdtempSync(path.join(os.tmpdir(), "sysfix-"));
});

afterEach(() => {
  fs.rmSync(sysDir, { recursive: true, force: true });
});

describe("parseMilliC", () => {
  it("converts millidegrees to degrees", () => {
    expect(parseMilliC("56500")).toBe(56.5);
  });

  it("rejects values outside a plausible range", () => {
    expect(parseMilliC("999000")).toBeNull(); // 999 C
    expect(parseMilliC("-90000")).toBeNull();
  });

  it("rejects non-numeric readings", () => {
    expect(parseMilliC("n/a")).toBeNull();
  });
});

describe("collectTemperature", () => {
  it("reads a Raspberry Pi thermal zone", async () => {
    writeThermalZone(0, "cpu-thermal", 47300);

    const result = await collectTemperature({ sysPath: sysDir });

    expect(result.cpu).toBe(47.3);
    expect(result.unit).toBe("C");
    expect(result.sensor).toBe("cpu-thermal");
    expect(result.source).toBe("thermal_zone");
  });

  it("reads an AMD hwmon sensor when no thermal zone exists", async () => {
    // This is the Jelly layout; the old hardcoded thermal_zone0 path found
    // nothing here and the panel showed no temperature at all.
    writeHwmon(0, "k10temp", { 1: { milliC: 56500, label: "Tctl" } });

    const result = await collectTemperature({ sysPath: sysDir });

    expect(result.cpu).toBe(56.5);
    expect(result.sensor).toBe("Tctl");
    expect(result.source).toBe("hwmon");
  });

  it("prefers a CPU thermal zone over an unrelated one", async () => {
    writeThermalZone(0, "wifi-thermal", 40000);
    writeThermalZone(1, "cpu-thermal", 60000);

    const result = await collectTemperature({ sysPath: sysDir });
    expect(result.sensor).toBe("cpu-thermal");
    expect(result.cpu).toBe(60);
  });

  it("prefers a known CPU chip over a generic ACPI sensor", async () => {
    writeHwmon(0, "acpitz", { 1: { milliC: 27800 } });
    writeHwmon(1, "k10temp", { 1: { milliC: 58000, label: "Tdie" } });

    const result = await collectTemperature({ sysPath: sysDir });
    expect(result.sensor).toBe("Tdie");
  });

  it("prefers Tdie over Tctl within the same chip", async () => {
    writeHwmon(0, "k10temp", {
      1: { milliC: 60000, label: "Tctl" },
      2: { milliC: 55000, label: "Tdie" },
    });

    const result = await collectTemperature({ sysPath: sysDir });
    expect(result.sensor).toBe("Tdie");
    expect(result.cpu).toBe(55);
  });

  it("skips a sensor whose reading is unusable and uses the next", async () => {
    writeThermalZone(0, "cpu-thermal", 999000); // implausible
    writeHwmon(0, "k10temp", { 1: { milliC: 52000, label: "Tctl" } });

    const result = await collectTemperature({ sysPath: sysDir });
    expect(result.cpu).toBe(52);
  });

  it("falls back to systeminformation when sysfs offers nothing", async () => {
    const result = await collectTemperature({
      sysPath: sysDir,
      siFallback: async () => ({ main: 41.25 }),
    });
    expect(result.cpu).toBe(41.3);
    expect(result.source).toBe("si");
  });

  it("reports null rather than throwing when nothing at all is available", async () => {
    const result = await collectTemperature({
      sysPath: sysDir,
      siFallback: async () => ({ main: null }),
    });
    expect(result.cpu).toBeNull();
    expect(result.unit).toBe("C");
  });

  it("discovers sensors once and caches the result", async () => {
    writeThermalZone(0, "cpu-thermal", 45000);

    const first = await discoverSensors(sysDir);
    const second = await discoverSensors(sysDir);
    expect(second).toBe(first);
  });
});
