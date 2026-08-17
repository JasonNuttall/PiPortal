/**
 * Runtime configuration.
 *
 * A single image serves two roles:
 *   - "hub"   : serves the dashboard API, owns the node registry and the
 *               service links, and aggregates every registered agent.
 *               It also collects its own local metrics (it is a node too).
 *   - "agent" : collects local metrics only. No registry, no service links.
 *
 * Defaulting to "hub" keeps single-machine deployments working unchanged.
 */
const os = require("os");

const ROLE = (process.env.NODE_ROLE || "hub").toLowerCase();

if (!["hub", "agent"].includes(ROLE)) {
  throw new Error(`Invalid NODE_ROLE "${ROLE}" (expected "hub" or "agent")`);
}

/** Slugify a hostname into a stable node id. */
const slugify = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "node";

const config = {
  role: ROLE,
  isHub: ROLE === "hub",
  isAgent: ROLE === "agent",

  port: Number(process.env.PORT) || 3001,
  env: process.env.NODE_ENV || "development",

  /** Identity this process reports for its own hardware. */
  node: {
    id: slugify(process.env.NODE_ID || os.hostname()),
    name: process.env.NODE_NAME || os.hostname(),
  },

  /**
   * Shared secret. On an agent, requests to /api must present it.
   * On a hub it is only used for its own /api/local routes.
   * Unset (the default) disables auth, which is the sane LAN default.
   */
  authToken: process.env.AGENT_TOKEN || null,

  dbPath: process.env.DB_PATH || "./data/homelab.db",

  hostProc: process.env.HOST_PROC || "/proc",
  hostRoot: process.env.HOST_ROOT || "/host",
  dockerSocket: process.env.DOCKER_SOCKET || "/var/run/docker.sock",

  /** Max processes returned in a process listing. */
  processLimit: Number(process.env.PROCESS_LIMIT) || 150,

  /** How long a hub waits on an agent before treating the call as failed. */
  agentTimeoutMs: Number(process.env.AGENT_TIMEOUT_MS) || 8000,

  corsOrigin: process.env.CORS_ORIGIN || null,
};

module.exports = config;
module.exports.slugify = slugify;
