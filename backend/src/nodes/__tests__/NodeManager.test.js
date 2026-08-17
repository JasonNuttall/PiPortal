// Covers the fan-in and demand-propagation logic that makes multi-node work:
// nothing should be collected on a node nobody is looking at.
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const { EventEmitter } = require("events");
const { initDatabase, setDb } = require("../../db/database");
const NodeModel = require("../../db/NodeModel");
const NodeManager = require("../NodeManager");
const { parseNodeChannel, nodeChannel } = require("../NodeManager");

/** Stand-in for a real client; records the channels it was asked to produce. */
class FakeClient extends EventEmitter {
  constructor(node) {
    super();
    this.node = node;
    this.desired = new Set();
    this.started = false;
    this.stopped = false;
    this._status = "online";
  }
  get id() {
    return this.node.id;
  }
  get status() {
    return this._status;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
  setDesiredChannels(channels) {
    this.desired = new Set(channels);
  }
  describe() {
    return {
      id: this.node.id,
      name: this.node.name,
      url: this.node.url,
      isLocal: Boolean(this.node.isLocal),
      enabled: true,
      status: this._status,
      lastSeen: null,
      error: null,
    };
  }
  async fetch(channel) {
    return { channel, from: this.node.id };
  }
  /** Simulate the agent pushing data upstream. */
  push(channel, data) {
    this.emit("data", channel, data, 12345);
  }
}

let db;
let manager;
let created;

const build = () => {
  created = new Map();
  manager = new NodeManager({
    createClient: (node) => {
      const client = new FakeClient(node);
      created.set(node.id, client);
      return client;
    },
  });
  manager.start();
};

beforeEach(() => {
  db = initDatabase(":memory:", {
    seed: false,
    localNode: { id: "pi5", name: "Raspberry Pi 5" },
  });
  setDb(db);
  NodeModel.create({ id: "jelly", name: "Jelly", url: "http://jelly:3001" });
  build();
});

afterEach(() => {
  manager.stop();
  setDb(null);
  db.close();
});

describe("parseNodeChannel", () => {
  it("splits a namespaced channel", () => {
    expect(parseNodeChannel("node:jelly:metrics:system")).toEqual({
      nodeId: "jelly",
      channel: "metrics:system",
    });
  });

  it("returns null for an unnamespaced channel", () => {
    expect(parseNodeChannel("fleet")).toBeNull();
    expect(parseNodeChannel("metrics:system")).toBeNull();
  });

  it("round-trips with nodeChannel", () => {
    const built = nodeChannel("pi5", "docker:containers");
    expect(parseNodeChannel(built)).toEqual({
      nodeId: "pi5",
      channel: "docker:containers",
    });
  });
});

describe("NodeManager", () => {
  it("starts a client for every registered node", () => {
    expect([...created.keys()].sort()).toEqual(["jelly", "pi5"]);
    expect(created.get("jelly").started).toBe(true);
  });

  it("collects nothing until something is subscribed", () => {
    expect(created.get("pi5").desired.size).toBe(0);
    expect(created.get("jelly").desired.size).toBe(0);
  });

  it("routes demand to the addressed node only", () => {
    manager.setDemand(["node:jelly:metrics:processes"]);

    expect([...created.get("jelly").desired]).toEqual(["metrics:processes"]);
    // The Pi is not being looked at, so it must stay idle.
    expect(created.get("pi5").desired.size).toBe(0);
  });

  it("asks every node for a summary when the fleet strip is open", () => {
    manager.setDemand(["fleet"]);

    expect(created.get("pi5").desired.has("summary")).toBe(true);
    expect(created.get("jelly").desired.has("summary")).toBe(true);
  });

  it("drops demand when the last subscriber leaves", () => {
    manager.setDemand(["node:jelly:metrics:system"]);
    expect(created.get("jelly").desired.size).toBe(1);

    manager.setDemand([]);
    expect(created.get("jelly").desired.size).toBe(0);
  });

  it("re-emits node data under a namespaced channel", () => {
    const received = [];
    manager.on("data", (channel, data) => received.push([channel, data]));

    created.get("jelly").push("metrics:system", { cpu: 42 });

    expect(received).toContainEqual([
      "node:jelly:metrics:system",
      { cpu: 42 },
    ]);
  });

  it("caches the last value so a new subscriber paints immediately", () => {
    created.get("jelly").push("metrics:system", { cpu: 42 });

    expect(manager.peek("node:jelly:metrics:system")).toMatchObject({
      data: { cpu: 42 },
      timestamp: 12345,
    });
  });

  it("builds the fleet overview from node summaries", () => {
    created.get("jelly").push("summary", { cpuLoad: 63 });
    created.get("pi5").push("summary", { cpuLoad: 12 });

    const fleet = manager.getFleet();
    expect(fleet.find((n) => n.id === "jelly").summary.cpuLoad).toBe(63);
    expect(fleet.find((n) => n.id === "pi5").summary.cpuLoad).toBe(12);
  });

  it("lists a node with a null summary before it has reported", () => {
    expect(manager.getFleet().every((n) => n.summary === null)).toBe(true);
  });

  it("collects missing summaries on demand for the REST overview", async () => {
    // Nothing is subscribed, so no summary has been sampled yet; the REST
    // overview must still return figures rather than a row of nulls.
    const fleet = await manager.collectFleet();

    expect(fleet).toHaveLength(2);
    for (const node of fleet) {
      expect(node.summary).toMatchObject({ channel: "summary" });
    }
  });

  it("does not re-collect a summary it already has", async () => {
    created.get("jelly").push("summary", { cpuLoad: 5 });
    const spy = vi.spyOn(created.get("jelly"), "fetch");

    await manager.collectFleet();

    expect(spy).not.toHaveBeenCalled();
  });

  it("leaves an unreachable node's summary null", async () => {
    vi.spyOn(created.get("jelly"), "fetch").mockRejectedValue(
      new Error("ECONNREFUSED")
    );

    const fleet = await manager.collectFleet();
    expect(fleet.find((n) => n.id === "jelly").summary).toBeNull();
  });

  it("validates channels against the live registry", () => {
    expect(manager.isValidChannel("node:jelly:metrics:system")).toBe(true);
    expect(manager.isValidChannel("fleet")).toBe(true);
    expect(manager.isValidChannel("nodes")).toBe(true);
    expect(manager.isValidChannel("node:ghost:metrics:system")).toBe(false);
    expect(manager.isValidChannel("node:jelly:metrics:bogus")).toBe(false);
  });

  it("starts a client when a node is added", () => {
    NodeModel.create({ id: "nas", name: "NAS", url: "http://nas:3001" });
    manager.reconcile();

    expect(created.has("nas")).toBe(true);
    expect(created.get("nas").started).toBe(true);
  });

  it("stops and forgets a client when its node is removed", () => {
    const jelly = created.get("jelly");
    jelly.push("metrics:system", { cpu: 1 });

    NodeModel.delete("jelly");
    manager.reconcile();

    expect(jelly.stopped).toBe(true);
    expect(manager.peek("node:jelly:metrics:system")).toBeUndefined();
  });

  it("stops a client when its node is disabled", () => {
    const jelly = created.get("jelly");
    NodeModel.update("jelly", { enabled: false });
    manager.reconcile();

    expect(jelly.stopped).toBe(true);
    expect(manager.getClient("jelly")).toBeUndefined();
  });

  it("rebuilds the client when a node's URL changes", () => {
    const original = created.get("jelly");
    NodeModel.update("jelly", { name: "Jelly", url: "http://jelly-new:3001" });
    manager.reconcile();

    expect(original.stopped).toBe(true);
    expect(manager.getClient("jelly")).not.toBe(original);
    expect(manager.getClient("jelly").node.url).toBe("http://jelly-new:3001");
  });

  it("keeps the existing client when only the name changes", () => {
    const original = created.get("jelly");
    NodeModel.update("jelly", { name: "Renamed", url: "http://jelly:3001" });
    manager.reconcile();

    expect(original.stopped).toBe(false);
    expect(manager.getClient("jelly")).toBe(original);
  });

  it("reapplies outstanding demand after a node is added", () => {
    manager.setDemand(["fleet"]);
    NodeModel.create({ id: "nas", name: "NAS", url: "http://nas:3001" });
    manager.reconcile();

    expect(created.get("nas").desired.has("summary")).toBe(true);
  });

  it("proxies a fetch to the addressed node", async () => {
    await expect(manager.fetch("node:jelly:metrics:system")).resolves.toEqual({
      channel: "metrics:system",
      from: "jelly",
    });
  });

  it("reports 404 for a fetch against an unknown node", async () => {
    await expect(manager.fetch("node:ghost:metrics:system")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
