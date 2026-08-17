/**
 * CPU temperature collection.
 *
 * The original code read /sys/class/thermal/thermal_zone0/temp, which is the
 * Raspberry Pi layout. An AMD desktop exposes no thermal zones at all — its
 * sensor lives at /sys/class/hwmon/hwmonN (k10temp) — so that path returns
 * nothing and the panel goes blank.
 *
 * Sensors are discovered once (the set does not change at runtime) and ranked,
 * so each host automatically uses the best source it actually has.
 */
const fs = require("fs/promises");
const si = require("systeminformation");
const logger = require("../utils/logger");

const DEFAULT_SYS_PATH = process.env.HOST_SYS || "/sys";

/**
 * Preference order for thermal_zone `type` values. Lower rank wins.
 * Anything unrecognised is still usable, just last.
 */
const ZONE_PRIORITY = [
  "x86_pkg_temp", // Intel package
  "cpu-thermal", // Raspberry Pi 5 / many ARM SoCs
  "cpu_thermal", // Raspberry Pi 4 and earlier
  "soc_thermal",
  "coretemp",
];

/** Preference order for hwmon `name` values. */
const HWMON_PRIORITY = [
  "k10temp", // AMD Zen
  "zenpower", // AMD Zen, third-party driver
  "coretemp", // Intel
  "cpu_thermal",
  "acpitz", // generic ACPI, often inaccurate but better than nothing
];

/** Within a k10temp/coretemp chip, these labels are the real CPU reading. */
const LABEL_PRIORITY = ["Tdie", "Tctl", "Package id 0", "Core 0"];

const rankOf = (list, value) => {
  const index = list.indexOf(value);
  return index === -1 ? list.length : index;
};

const readTrimmed = async (path) => (await fs.readFile(path, "utf8")).trim();

/** Sysfs reports millidegrees Celsius. */
const parseMilliC = (raw) => {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const celsius = value / 1000;
  // Guard against drivers that report in whole degrees or return garbage.
  if (celsius < -50 || celsius > 200) return null;
  return Number(celsius.toFixed(1));
};

const discoverThermalZones = async (SYS_PATH) => {
  const sensors = [];
  let entries;
  try {
    entries = await fs.readdir(`${SYS_PATH}/class/thermal`);
  } catch {
    return sensors;
  }

  for (const entry of entries) {
    if (!entry.startsWith("thermal_zone")) continue;
    const base = `${SYS_PATH}/class/thermal/${entry}`;
    try {
      const type = await readTrimmed(`${base}/type`);
      await fs.access(`${base}/temp`);
      sensors.push({
        source: "thermal_zone",
        label: type,
        path: `${base}/temp`,
        rank: rankOf(ZONE_PRIORITY, type),
      });
    } catch {
      continue;
    }
  }
  return sensors;
};

const discoverHwmon = async (SYS_PATH) => {
  const sensors = [];
  let entries;
  try {
    entries = await fs.readdir(`${SYS_PATH}/class/hwmon`);
  } catch {
    return sensors;
  }

  for (const entry of entries) {
    const base = `${SYS_PATH}/class/hwmon/${entry}`;
    let chipName;
    try {
      chipName = await readTrimmed(`${base}/name`);
    } catch {
      continue;
    }

    const chipRank = rankOf(HWMON_PRIORITY, chipName);
    let files;
    try {
      files = await fs.readdir(base);
    } catch {
      continue;
    }

    for (const file of files) {
      const match = /^temp(\d+)_input$/.exec(file);
      if (!match) continue;

      let label = null;
      try {
        label = await readTrimmed(`${base}/temp${match[1]}_label`);
      } catch {
        // Not all channels are labelled.
      }

      sensors.push({
        source: "hwmon",
        chip: chipName,
        label: label || `${chipName} temp${match[1]}`,
        path: `${base}/${file}`,
        // Chip identity dominates; label breaks ties within a chip.
        rank: chipRank * 10 + rankOf(LABEL_PRIORITY, label),
      });
    }
  }
  return sensors;
};

/** Discovery is cached per sysfs root; the set of sensors never changes. */
const sensorsPromises = new Map();

const discoverSensors = (sysPath = DEFAULT_SYS_PATH) => {
  if (!sensorsPromises.has(sysPath)) {
    sensorsPromises.set(sysPath, (async () => {
      const [zones, hwmon] = await Promise.all([
        discoverThermalZones(sysPath),
        discoverHwmon(sysPath),
      ]);
      // Prefer a recognised sensor from either source over an unrecognised one.
      const sensors = [...zones, ...hwmon].sort((a, b) => a.rank - b.rank);
      logger.info(
        { count: sensors.length, best: sensors[0]?.label ?? null },
        "Temperature sensors discovered"
      );
      return sensors;
    })());
  }
  return sensorsPromises.get(sysPath);
};

const collectTemperature = async ({
  sysPath = DEFAULT_SYS_PATH,
  // Injectable so tests can assert the no-sensor path on a host that has one.
  siFallback = () => si.cpuTemperature(),
} = {}) => {
  const sensors = await discoverSensors(sysPath);

  for (const sensor of sensors) {
    try {
      const value = parseMilliC(await readTrimmed(sensor.path));
      if (value !== null) {
        return {
          cpu: value,
          unit: "C",
          sensor: sensor.label,
          source: sensor.source,
        };
      }
    } catch {
      continue; // sensor vanished (hotplug); try the next
    }
  }

  // Last resort: let systeminformation try platform-specific probing.
  try {
    const temp = await siFallback();
    if (temp.main !== null && temp.main !== undefined && temp.main > 0) {
      return {
        cpu: Number(temp.main.toFixed(1)),
        unit: "C",
        sensor: "systeminformation",
        source: "si",
      };
    }
  } catch {
    // fall through
  }

  return { cpu: null, unit: "C", sensor: null, source: null };
};

/** Test seam: force sensor rediscovery. */
const __reset = () => {
  sensorsPromises.clear();
};

module.exports = {
  collectTemperature,
  discoverSensors,
  parseMilliC,
  rankOf,
  ZONE_PRIORITY,
  HWMON_PRIORITY,
  __reset,
};
