import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchSystemMetrics,
  fetchTemperature,
  fetchDiskMetrics,
  fetchDockerContainers,
  fetchDockerInfo,
  fetchServices,
  createService,
  updateService,
  deleteService,
  fetchDetailedDiskInfo,
  fetchNetworkMetrics,
  fetchProcesses,
} from "../api";

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

const mockOkResponse = (data) => ({
  ok: true,
  json: () => Promise.resolve(data),
});

const mockErrorResponse = (status = 500) => ({
  ok: false,
  status,
  json: () => Promise.resolve({ error: "Server error" }),
});

describe("API functions", () => {
  describe("GET endpoints", () => {
    const getEndpoints = [
      { fn: fetchSystemMetrics, url: "/api/metrics/system", name: "fetchSystemMetrics" },
      { fn: fetchTemperature, url: "/api/metrics/temperature", name: "fetchTemperature" },
      { fn: fetchDiskMetrics, url: "/api/metrics/disk", name: "fetchDiskMetrics" },
      { fn: fetchDockerContainers, url: "/api/docker/containers", name: "fetchDockerContainers" },
      { fn: fetchDockerInfo, url: "/api/docker/info", name: "fetchDockerInfo" },
      { fn: fetchServices, url: "/api/services", name: "fetchServices" },
      { fn: fetchDetailedDiskInfo, url: "/api/metrics/disk/detailed", name: "fetchDetailedDiskInfo" },
      { fn: fetchNetworkMetrics, url: "/api/metrics/network", name: "fetchNetworkMetrics" },
      { fn: fetchProcesses, url: "/api/metrics/processes", name: "fetchProcesses" },
    ];

    getEndpoints.forEach(({ fn, url, name }) => {
      it(`${name} calls correct URL`, async () => {
        const data = { test: true };
        mockFetch.mockResolvedValue(mockOkResponse(data));

        const result = await fn();
        expect(mockFetch.mock.calls[0][0]).toBe(url);
        expect(result).toEqual(data);
      });

      it(`${name} throws on error response`, async () => {
        mockFetch.mockResolvedValue(mockErrorResponse());
        await expect(fn()).rejects.toThrow();
      });
    });
  });

  describe("createService", () => {
    it("sends POST with correct body and headers", async () => {
      const service = { name: "Test", url: "http://test" };
      mockFetch.mockResolvedValue(mockOkResponse({ ...service, id: 1 }));

      const result = await createService(service);

      expect(mockFetch.mock.calls[0][0]).toBe("/api/services");
      expect(mockFetch.mock.calls[0][1]).toMatchObject({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(service),
      });
      expect(result.id).toBe(1);
    });

    it("throws on error response", async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(400));
      await expect(createService({})).rejects.toThrow("Failed to create service");
    });
  });

  describe("updateService", () => {
    it("sends PUT with correct URL and body", async () => {
      const service = { name: "Updated", url: "http://updated" };
      mockFetch.mockResolvedValue(mockOkResponse({ ...service, id: 5 }));

      const result = await updateService(5, service);

      expect(mockFetch.mock.calls[0][0]).toBe("/api/services/5");
      expect(mockFetch.mock.calls[0][1]).toMatchObject({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(service),
      });
      expect(result.name).toBe("Updated");
    });

    it("throws on error response", async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(404));
      await expect(updateService(999, {})).rejects.toThrow("Failed to update service");
    });
  });

  describe("deleteService", () => {
    it("sends DELETE with correct URL", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await deleteService(3);

      expect(mockFetch).toHaveBeenCalledWith("/api/services/3", expect.objectContaining({
        method: "DELETE",
      }));
    });

    it("throws on error response", async () => {
      mockFetch.mockResolvedValue(mockErrorResponse());
      await expect(deleteService(1)).rejects.toThrow("Failed to delete service");
    });
  });

  describe("request timeouts", () => {
    it("passes an AbortSignal to fetch", async () => {
      mockFetch.mockResolvedValue(mockOkResponse({ test: true }));

      await fetchSystemMetrics();

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1]).toBeDefined();
      expect(callArgs[1].signal).toBeInstanceOf(AbortSignal);
    });

    it("abort signal is not already aborted on call", async () => {
      mockFetch.mockResolvedValue(mockOkResponse({}));

      await fetchSystemMetrics();

      const signal = mockFetch.mock.calls[0][1].signal;
      // Signal should have been created fresh (not pre-aborted)
      expect(signal.aborted).toBe(false);
    });

    it("all fetch functions include signal in options", async () => {
      mockFetch.mockResolvedValue(mockOkResponse({}));

      const fns = [
        () => fetchSystemMetrics(),
        () => fetchTemperature(),
        () => fetchDiskMetrics(),
        () => fetchDockerContainers(),
        () => fetchDockerInfo(),
        () => fetchServices(),
        () => fetchDetailedDiskInfo(),
        () => fetchNetworkMetrics(),
        () => fetchProcesses(),
      ];

      for (const fn of fns) {
        mockFetch.mockClear();
        await fn();
        const callArgs = mockFetch.mock.calls[0];
        expect(callArgs[1]?.signal).toBeInstanceOf(AbortSignal);
      }
    });
  });
});
