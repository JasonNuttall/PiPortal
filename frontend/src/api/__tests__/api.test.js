import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as api from "../api";

const okResponse = (body = {}) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue(okResponse());
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The path fetch was called with, minus the base. */
const calledPath = () => globalThis.fetch.mock.calls[0][0];
const calledOptions = () => globalThis.fetch.mock.calls[0][1];

describe("node registry", () => {
  it("lists nodes", async () => {
    await api.fetchNodes();
    expect(calledPath()).toBe("/api/nodes");
  });

  it("fetches the fleet overview", async () => {
    await api.fetchFleet();
    expect(calledPath()).toBe("/api/nodes/fleet");
  });

  it("creates a node", async () => {
    await api.createNode({ id: "jelly", name: "Jelly", url: "http://jelly:3001" });

    expect(calledPath()).toBe("/api/nodes");
    expect(calledOptions().method).toBe("POST");
    expect(JSON.parse(calledOptions().body)).toMatchObject({ id: "jelly" });
  });

  it("updates a node", async () => {
    await api.updateNode("jelly", { name: "Renamed" });
    expect(calledPath()).toBe("/api/nodes/jelly");
    expect(calledOptions().method).toBe("PUT");
  });

  it("deletes a node", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, status: 204 });
    await api.deleteNode("jelly");
    expect(calledPath()).toBe("/api/nodes/jelly");
    expect(calledOptions().method).toBe("DELETE");
  });

  it("tests a node", async () => {
    await api.testNode("jelly");
    expect(calledPath()).toBe("/api/nodes/jelly/test");
    expect(calledOptions().method).toBe("POST");
  });
});

describe("node-scoped metrics", () => {
  it.each([
    ["fetchSystemMetrics", "/api/nodes/jelly/metrics/system"],
    ["fetchTemperature", "/api/nodes/jelly/metrics/temperature"],
    ["fetchDiskMetrics", "/api/nodes/jelly/metrics/disk"],
    ["fetchNetworkMetrics", "/api/nodes/jelly/metrics/network"],
    ["fetchProcesses", "/api/nodes/jelly/metrics/processes"],
    ["fetchDockerContainers", "/api/nodes/jelly/docker/containers"],
    ["fetchDockerInfo", "/api/nodes/jelly/docker/info"],
  ])("%s addresses the given node", async (fn, expected) => {
    await api[fn]("jelly");
    expect(calledPath()).toBe(expected);
  });

  it("translates a channel name into a path", async () => {
    await api.fetchNodeChannel("pi5", "metrics:disk");
    expect(calledPath()).toBe("/api/nodes/pi5/metrics/disk");
  });

  it("targets whichever node is asked for", async () => {
    await api.fetchSystemMetrics("pi5");
    expect(calledPath()).toBe("/api/nodes/pi5/metrics/system");
  });

  it("posts a container action to the owning node", async () => {
    await api.containerAction("jelly", "abc123", "restart");
    expect(calledPath()).toBe(
      "/api/nodes/jelly/docker/containers/abc123/restart"
    );
    expect(calledOptions().method).toBe("POST");
  });
});

describe("services", () => {
  it("scopes a listing to a node", async () => {
    await api.fetchServices("jelly");
    expect(calledPath()).toBe("/api/services?nodeId=jelly");
  });

  it("encodes the node id", async () => {
    await api.fetchServices("a b");
    expect(calledPath()).toBe("/api/services?nodeId=a%20b");
  });

  it("lists every service when no node is given", async () => {
    await api.fetchServices();
    expect(calledPath()).toBe("/api/services");
  });

  it("creates a service", async () => {
    await api.createService({ name: "X", url: "http://x", nodeId: "jelly" });
    expect(calledPath()).toBe("/api/services");
    expect(JSON.parse(calledOptions().body).nodeId).toBe("jelly");
  });

  it("updates and deletes a service", async () => {
    await api.updateService(7, { name: "X", url: "http://x" });
    expect(calledPath()).toBe("/api/services/7");

    globalThis.fetch.mockClear();
    globalThis.fetch.mockResolvedValue({ ok: true, status: 204 });
    await api.deleteService(7);
    expect(calledPath()).toBe("/api/services/7");
  });
});

describe("error handling", () => {
  it("throws the server's message", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Name is required" }),
    });

    await expect(api.createNode({})).rejects.toThrow("Name is required");
  });

  it("falls back to a status message when the body is not JSON", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    });

    await expect(api.fetchNodes()).rejects.toThrow(/502/);
  });

  it("exposes the status code on the error", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "Node not found" }),
    });

    await expect(api.fetchNodes()).rejects.toMatchObject({ status: 404 });
  });

  it("returns null for a 204 rather than parsing an empty body", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, status: 204 });
    await expect(api.deleteService(1)).resolves.toBeNull();
  });

  it("applies a timeout signal to every request", async () => {
    await api.fetchNodes();
    expect(calledOptions().signal).toBeInstanceOf(AbortSignal);
  });
});
