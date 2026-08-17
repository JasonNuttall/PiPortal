/**
 * Channel names shared by the REST client and the WebSocket layer.
 *
 * Every metric channel is scoped to a node. Two channels are fleet-level:
 *   fleet - one summary row per node, for the overview strip
 *   nodes - registry and reachability changes
 */
export const FLEET_CHANNEL = "fleet";

/**
 * Panel id -> the node-local channel that feeds it.
 *
 * The services panel is absent on purpose: service links are edited by hand in
 * this UI rather than sampled from the machine, so they are fetched over REST
 * and refreshed on mutation instead of being streamed.
 */
export const PANEL_TO_CHANNEL = {
  network: "metrics:network",
  disk: "metrics:disk",
  processes: "metrics:processes",
  docker: "docker:containers",
};

/** Channels the header/summary cards need, independent of any panel. */
export const CORE_CHANNELS = [
  "metrics:system",
  "metrics:temperature",
  "docker:info",
];

/** Every panel, including the ones not backed by a streaming channel. */
export const PANEL_IDS = [...Object.keys(PANEL_TO_CHANNEL), "services"];

/** Panels whose data can be streamed, and so offer a live/poll toggle. */
export const STREAMABLE_PANEL_IDS = Object.keys(PANEL_TO_CHANNEL);

/** Build the hub-facing name for a node's channel. */
export const nodeChannel = (nodeId, channel) => `node:${nodeId}:${channel}`;

/** Default polling interval per panel, in ms, when not in real-time mode. */
export const DEFAULT_POLLING_INTERVALS = {
  network: 2000,
  disk: 10000,
  processes: 3000,
  docker: 5000,
  services: 30000,
};
