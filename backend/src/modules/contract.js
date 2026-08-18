/**
 * The module contract.
 *
 * A module supplies data and what that data means; the portal decides how to
 * draw it. Everything arriving here is from a service the portal does not
 * control, so this is the trust boundary: unknown shapes and unknown fields
 * are dropped rather than passed through, sizes are bounded, and every URL is
 * checked before it can reach a browser.
 */

const CONTRACT_VERSION = 1;

/** Shapes the portal knows how to draw, and the views each allows. */
const SHAPE_VIEWS = {
  metric: ["stat", "gauge"],
  collection: ["list", "grid", "table"],
  schedule: ["calendar", "agenda", "list", "grid", "table"],
  series: ["spark", "chart"],
};

const SHAPES = Object.keys(SHAPE_VIEWS);
const TONES = ["ok", "warn", "error"];

const LIMITS = {
  datasets: 8,
  items: 200,
  points: 500,
  text: 200,
  detail: 12,
};

class ContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "ContractError";
  }
}

/** Trim to a bounded string, or null. Anything non-primitive is discarded. */
const text = (value, max = LIMITS.text) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return null;
  const str = String(value).trim();
  return str ? str.slice(0, max) : null;
};

const finite = (value) => {
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
};

const tone = (value) => (TONES.includes(value) ? value : null);

/**
 * Only http(s) URLs survive. A module returning javascript: or data: is either
 * broken or hostile, and either way the portal must not hand it to a browser.
 */
const url = (value) => {
  const raw = text(value, 2000);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
};

/** ISO date or datetime; anything unparseable drops the item from a schedule. */
const isoDate = (value) => {
  const raw = text(value, 40);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : raw;
};

const normalizeDetail = (value) =>
  Array.isArray(value)
    ? value
        .slice(0, LIMITS.detail)
        .map((entry) => ({
          label: text(entry?.label, 60),
          value: text(entry?.value, 300),
        }))
        .filter((entry) => entry.label && entry.value !== null)
    : [];

/**
 * The fixed item vocabulary. Fields outside it are dropped on purpose: a field
 * only one view understands is a field that vanishes when the view changes.
 */
const normalizeItem = (raw, index) => {
  const title = text(raw?.title);
  if (!title) return null;

  return {
    id: text(raw?.id, 120) ?? `item-${index}`,
    title,
    subtitle: text(raw?.subtitle),
    meta: text(raw?.meta, 60),
    date: isoDate(raw?.date),
    image: url(raw?.image),
    href: url(raw?.href),
    tone: tone(raw?.tone),
    detail: normalizeDetail(raw?.detail),
  };
};

const normalizeDataset = (raw, index) => {
  const shape = SHAPES.includes(raw?.shape) ? raw.shape : null;
  if (!shape) return null;

  const base = {
    id: text(raw?.id, 60) ?? `dataset-${index}`,
    label: text(raw?.label, 80),
    shape,
    views: SHAPE_VIEWS[shape],
    // A suggestion the portal may take as a default; it must still be a view
    // that shape actually supports.
    suggests: SHAPE_VIEWS[shape].includes(raw?.suggests) ? raw.suggests : null,
    window: shape === "schedule" && raw?.window === true,
  };

  if (shape === "metric") {
    const value = finite(raw?.value);
    if (value === null) return null;
    return {
      ...base,
      value,
      max: finite(raw?.max),
      unit: text(raw?.unit, 12),
      tone: tone(raw?.tone),
    };
  }

  if (shape === "series") {
    const points = Array.isArray(raw?.points)
      ? raw.points
          .slice(0, LIMITS.points)
          .map((point) => ({ t: isoDate(point?.t), v: finite(point?.v) }))
          .filter((point) => point.t && point.v !== null)
      : [];
    return { ...base, points };
  }

  const items = Array.isArray(raw?.items)
    ? raw.items
        .slice(0, LIMITS.items)
        .map(normalizeItem)
        .filter(Boolean)
        // A schedule entry without a date cannot be placed on a calendar.
        .filter((item) => shape !== "schedule" || item.date)
    : [];

  return { ...base, items };
};

/**
 * Validate and normalise a module payload.
 * @throws {ContractError} when the payload is unusable as a whole
 */
const normalizeModulePayload = (raw, { id } = {}) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ContractError("Module did not return an object");
  }

  const version = finite(raw.contract);
  if (version === null) {
    throw new ContractError("Module payload is missing a contract version");
  }
  if (version > CONTRACT_VERSION) {
    throw new ContractError(
      `Module speaks contract ${version}; this portal understands ${CONTRACT_VERSION}`
    );
  }

  const datasets = Array.isArray(raw.datasets)
    ? raw.datasets.slice(0, LIMITS.datasets).map(normalizeDataset).filter(Boolean)
    : [];

  return {
    contract: version,
    id: text(raw.id, 60) ?? id ?? null,
    title: text(raw.title, 80),
    href: url(raw.href),
    status: ["ok", "warn", "error"].includes(raw.status) ? raw.status : "ok",
    // The service knows its own cost, but not well enough to be trusted with
    // the extremes.
    ttl: Math.min(Math.max(finite(raw.ttl) ?? 60, 5), 3600),
    datasets,
  };
};

/** Every image URL a payload references, for the proxy allowlist. */
const collectImageUrls = (payload) => {
  const urls = new Set();
  for (const dataset of payload?.datasets ?? []) {
    for (const item of dataset.items ?? []) {
      if (item.image) urls.add(item.image);
    }
  }
  return urls;
};

module.exports = {
  normalizeModulePayload,
  normalizeDataset,
  normalizeItem,
  collectImageUrls,
  ContractError,
  CONTRACT_VERSION,
  SHAPE_VIEWS,
  SHAPES,
  LIMITS,
};
