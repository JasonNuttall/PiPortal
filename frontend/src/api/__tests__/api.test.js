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


describe("modules", () => {
  it("lists modules", async () => {
    await api.fetchModules();
    expect(calledPath()).toBe("/api/modules");
  });

  it("creates a module", async () => {
    await api.createModule({ id: "missedanep", name: "Missed an Ep" });
    expect(calledPath()).toBe("/api/modules");
    expect(calledOptions().method).toBe("POST");
  });

  it("updates and deletes a module", async () => {
    await api.updateModule("missedanep", { name: "X" });
    expect(calledPath()).toBe("/api/modules/missedanep");

    globalThis.fetch.mockClear();
    globalThis.fetch.mockResolvedValue({ ok: true, status: 204 });
    await api.deleteModule("missedanep");
    expect(calledOptions().method).toBe("DELETE");
  });

  it("fetches a module's payload", async () => {
    await api.fetchModuleData("missedanep");
    expect(calledPath()).toBe("/api/modules/missedanep/data");
  });

  it("passes a schedule window through", async () => {
    await api.fetchModuleData("missedanep", { from: "2026-08-01", to: "2026-08-31" });
    expect(calledPath()).toBe(
      "/api/modules/missedanep/data?from=2026-08-01&to=2026-08-31"
    );
  });

  it("omits empty window bounds", async () => {
    await api.fetchModuleData("missedanep", { from: "", to: undefined });
    expect(calledPath()).toBe("/api/modules/missedanep/data");
  });

  it("routes images through the hub, encoded", () => {
    // Direct hotlinking would fail for services the browser cannot reach.
    expect(api.moduleImageUrl("missedanep", "https://img/a b.jpg")).toBe(
      "/api/modules/missedanep/image?u=https%3A%2F%2Fimg%2Fa%20b.jpg"
    );
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
    await expect(api.deleteModule("x")).resolves.toBeNull();
  });

  it("applies a timeout signal to every request", async () => {
    await api.fetchNodes();
    expect(calledOptions().signal).toBeInstanceOf(AbortSignal);
  });
});
