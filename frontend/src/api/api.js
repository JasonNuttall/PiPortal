/**
 * REST client.
 *
 * Metric requests are addressed to a node: /api/nodes/<id>/metrics/system.
 * The hub answers for its own hardware and proxies for every registered agent,
 * so the browser only ever talks to one origin.
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

const TIMEOUT_MS = 8000;

const request = async (path, { timeoutMs = TIMEOUT_MS, ...options } = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return response.status === 204 ? null : response.json();
};

const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/* ---------------------------------------------------------------- nodes -- */

export const fetchNodes = () => request("/nodes");

export const fetchFleet = () => request("/nodes/fleet");

export const createNode = (node) => request("/nodes", json("POST", node));

export const updateNode = (id, node) =>
  request(`/nodes/${id}`, json("PUT", node));

export const deleteNode = (id) => request(`/nodes/${id}`, { method: "DELETE" });

export const testNode = (id) => request(`/nodes/${id}/test`, { method: "POST" });

/* -------------------------------------------------------------- metrics -- */

/**
 * Fetch any collector channel from a node.
 * @param {string} nodeId
 * @param {string} channel - e.g. "metrics:system"
 */
export const fetchNodeChannel = (nodeId, channel) =>
  request(`/nodes/${nodeId}/${channel.replace(/:/g, "/")}`);

export const fetchSystemMetrics = (nodeId) =>
  fetchNodeChannel(nodeId, "metrics:system");

export const fetchTemperature = (nodeId) =>
  fetchNodeChannel(nodeId, "metrics:temperature");

export const fetchDiskMetrics = (nodeId) =>
  fetchNodeChannel(nodeId, "metrics:disk");

export const fetchNetworkMetrics = (nodeId) =>
  fetchNodeChannel(nodeId, "metrics:network");

export const fetchProcesses = (nodeId) =>
  fetchNodeChannel(nodeId, "metrics:processes");

export const fetchDockerContainers = (nodeId) =>
  fetchNodeChannel(nodeId, "docker:containers");

export const fetchDockerInfo = (nodeId) =>
  fetchNodeChannel(nodeId, "docker:info");

export const containerAction = (nodeId, containerId, action) =>
  request(`/nodes/${nodeId}/docker/containers/${containerId}/${action}`, {
    method: "POST",
  });

/* -------------------------------------------------------------- modules -- */

export const fetchModules = () => request("/modules");

/** Adapters this build ships, for the add-module picker. */
export const fetchAdapters = () => request("/modules/adapters");

export const createModule = (module) => request("/modules", json("POST", module));

export const updateModule = (id, module) =>
  request(`/modules/${id}`, json("PUT", module));

export const deleteModule = (id) =>
  request(`/modules/${id}`, { method: "DELETE" });

export const testModule = (id) =>
  request(`/modules/${id}/test`, { method: "POST" });

/**
 * A module's current payload.
 * @param {{from?: string, to?: string}} [window] - range for schedule datasets
 */
export const fetchModuleData = (id, window = {}) => {
  const params = new URLSearchParams(
    Object.entries(window).filter(([, value]) => value)
  );
  const query = params.toString();
  return request(`/modules/${id}/data${query ? `?${query}` : ""}`);
};

/**
 * Images are served through the hub so the browser talks to one origin and
 * services on an internal network still show their artwork.
 */
export const moduleImageUrl = (id, imageUrl) =>
  `${API_BASE_URL}/modules/${id}/image?u=${encodeURIComponent(imageUrl)}`;
