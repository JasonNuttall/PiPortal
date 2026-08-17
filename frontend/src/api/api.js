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

/* ------------------------------------------------------------- services -- */

/** Returns the node's own links plus every fleet-wide one. */
export const fetchServices = (nodeId) =>
  request(nodeId ? `/services?nodeId=${encodeURIComponent(nodeId)}` : "/services");

export const createService = (service) =>
  request("/services", json("POST", service));

export const updateService = (id, service) =>
  request(`/services/${id}`, json("PUT", service));

export const deleteService = (id) =>
  request(`/services/${id}`, { method: "DELETE" });
