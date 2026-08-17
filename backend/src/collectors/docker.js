/**
 * Docker container collection.
 *
 * Container state is event-driven, not continuous: it changes when someone
 * starts or stops something, which on a homelab is a handful of times a day.
 * Polling listContainers() every 5s therefore spends almost all of its effort
 * confirming nothing happened.
 *
 * This subscribes to the Docker event stream and marks the cache dirty when a
 * relevant event arrives, so listContainers() runs on change rather than on a
 * timer. A slow periodic refresh remains as a safety net in case the event
 * stream drops without emitting an error.
 */
const Docker = require("dockerode");
const logger = require("../utils/logger");
const config = require("../config");

const SAFETY_REFRESH_MS = 60000;
const RECONNECT_DELAY_MS = 5000;

// Events that can change what the containers panel shows.
const RELEVANT_EVENTS = new Set([
  "create",
  "destroy",
  "die",
  "kill",
  "pause",
  "rename",
  "restart",
  "start",
  "stop",
  "unpause",
  "update",
  "health_status",
]);

const docker = new Docker({ socketPath: config.dockerSocket });

let containerCache = null;
let cacheIsStale = true;
let eventStream = null;
let reconnectTimer = null;
let watching = false;

const formatContainer = (container) => ({
  id: container.Id.substring(0, 12),
  name: container.Names[0]?.replace(/^\//, "") ?? container.Id.substring(0, 12),
  image: container.Image,
  state: container.State,
  status: container.Status,
  created: container.Created,
  ports: (container.Ports || []).map((p) => ({
    private: p.PrivatePort,
    public: p.PublicPort,
    type: p.Type,
  })),
});

const handleEvent = (event) => {
  if (event.Type === "container" && RELEVANT_EVENTS.has(event.Action?.split(":")[0])) {
    cacheIsStale = true;
  }
};

const scheduleReconnect = () => {
  if (reconnectTimer || !watching) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    watchEvents();
  }, RECONNECT_DELAY_MS);
  reconnectTimer.unref?.();
};

/** Attach to the Docker event stream; falls back to polling if unavailable. */
const watchEvents = async () => {
  if (!watching) return;
  try {
    const stream = await docker.getEvents({
      filters: { type: ["container"] },
    });
    eventStream = stream;
    logger.info("Docker event stream attached");

    stream.on("data", (chunk) => {
      // The stream delivers newline-delimited JSON, possibly batched.
      for (const line of chunk.toString().split("\n")) {
        if (!line.trim()) continue;
        try {
          handleEvent(JSON.parse(line));
        } catch {
          // Ignore partial frames; the safety refresh will cover us.
          cacheIsStale = true;
        }
      }
    });

    stream.on("error", (err) => {
      logger.warn({ err }, "Docker event stream error, will reconnect");
      eventStream = null;
      cacheIsStale = true;
      scheduleReconnect();
    });

    stream.on("end", () => {
      eventStream = null;
      cacheIsStale = true;
      scheduleReconnect();
    });
  } catch (err) {
    logger.warn({ err }, "Docker event stream unavailable, using periodic refresh");
    eventStream = null;
    scheduleReconnect();
  }
};

const start = () => {
  if (watching) return;
  watching = true;
  watchEvents();
};

const stop = () => {
  watching = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (eventStream) {
    eventStream.destroy?.();
    eventStream = null;
  }
};

let lastRefresh = 0;

const collectContainers = async () => {
  const stale =
    cacheIsStale ||
    containerCache === null ||
    Date.now() - lastRefresh > SAFETY_REFRESH_MS;

  if (!stale) return containerCache;

  try {
    const containers = await docker.listContainers({ all: true });
    containerCache = containers.map(formatContainer);
    cacheIsStale = false;
    lastRefresh = Date.now();
  } catch (err) {
    logger.error({ err }, "Docker containers fetch error");
    // Serve the last good list rather than blanking the panel on a blip.
    if (containerCache === null) containerCache = [];
  }
  return containerCache;
};

const collectDockerInfo = async () => {
  try {
    const info = await docker.info();
    return {
      containersRunning: info.ContainersRunning,
      containersPaused: info.ContainersPaused,
      containersStopped: info.ContainersStopped,
      images: info.Images,
      serverVersion: info.ServerVersion,
    };
  } catch (err) {
    logger.error({ err }, "Docker info fetch error");
    return null;
  }
};

const ALLOWED_ACTIONS = ["start", "stop", "restart"];

const runContainerAction = async (id, action) => {
  if (!ALLOWED_ACTIONS.includes(action)) {
    const err = new Error("Invalid action");
    err.statusCode = 400;
    throw err;
  }
  await docker.getContainer(id)[action]();
  // The event stream will also mark this, but do it eagerly so the response
  // and the next collection reflect the change immediately.
  cacheIsStale = true;
};

const __reset = () => {
  containerCache = null;
  cacheIsStale = true;
  lastRefresh = 0;
};

module.exports = {
  collectContainers,
  collectDockerInfo,
  runContainerAction,
  formatContainer,
  start,
  stop,
  docker,
  ALLOWED_ACTIONS,
  __reset,
};
