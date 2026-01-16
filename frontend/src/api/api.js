const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

export const fetchSystemMetrics = async () => {
  const response = await fetch(`${API_BASE_URL}/metrics/system`);
  if (!response.ok) throw new Error("Failed to fetch system metrics");
  return response.json();
};

export const fetchTemperature = async () => {
  const response = await fetch(`${API_BASE_URL}/metrics/temperature`);
  if (!response.ok) throw new Error("Failed to fetch temperature");
  return response.json();
};

export const fetchDiskMetrics = async () => {
  const response = await fetch(`${API_BASE_URL}/metrics/disk`);
  if (!response.ok) throw new Error("Failed to fetch disk metrics");
  return response.json();
};

export const fetchDockerContainers = async () => {
  const response = await fetch(`${API_BASE_URL}/docker/containers`);
  if (!response.ok) throw new Error("Failed to fetch Docker containers");
  return response.json();
};

export const fetchDockerInfo = async () => {
  const response = await fetch(`${API_BASE_URL}/docker/info`);
  if (!response.ok) throw new Error("Failed to fetch Docker info");
  return response.json();
};

export const fetchServices = async () => {
  const response = await fetch(`${API_BASE_URL}/services`);
  if (!response.ok) throw new Error("Failed to fetch services");
  return response.json();
};

export const createService = async (service) => {
  const response = await fetch(`${API_BASE_URL}/services`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(service),
  });
  if (!response.ok) throw new Error("Failed to create service");
  return response.json();
};

export const updateService = async (id, service) => {
  const response = await fetch(`${API_BASE_URL}/services/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(service),
  });
  if (!response.ok) throw new Error("Failed to update service");
  return response.json();
};

export const deleteService = async (id) => {
  const response = await fetch(`${API_BASE_URL}/services/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete service");
};

export const fetchDetailedDiskInfo = async () => {
  const response = await fetch(`${API_BASE_URL}/metrics/disk/detailed`);
  if (!response.ok) throw new Error("Failed to fetch detailed disk info");
  return response.json();
};

export const fetchNetworkMetrics = async () => {
  const response = await fetch(`${API_BASE_URL}/metrics/network`);
  if (!response.ok) throw new Error("Failed to fetch network metrics");
  return response.json();
};

export const fetchProcesses = async () => {
  const response = await fetch(`${API_BASE_URL}/metrics/processes`);
  if (!response.ok) throw new Error("Failed to fetch processes");
  return response.json();
};
