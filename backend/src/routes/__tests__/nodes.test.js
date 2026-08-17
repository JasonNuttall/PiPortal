import { createRequire } from "module";
const require = createRequire(import.meta.url);

const express = require("express");
const request = require("supertest");
const { initDatabase, setDb } = require("../../db/database");
const NodeModel = require("../../db/NodeModel");
const createNodesRouter = require("../nodes");

let app;
let db;
let manager;

beforeEach(() => {
  db = initDatabase(":memory:", {
    seed: false,
    localNode: { id: "pi5", name: "Raspberry Pi 5" },
  });
  setDb(db);

  manager = {
    reconcile: vi.fn(),
    getNodes: () => NodeModel.getAll().map((n) => ({ ...n, status: "online" })),
    getFleet: () =>
      NodeModel.getAll().map((n) => ({ ...n, summary: { cpuLoad: 1 } })),
    collectFleet: async () =>
      NodeModel.getAll().map((n) => ({ ...n, summary: { cpuLoad: 1 } })),
    getClient: vi.fn(),
  };

  app = express();
  app.use(express.json());
  app.use("/api/nodes", createNodesRouter(manager));
});

afterEach(() => {
  setDb(null);
  db.close();
});

const addJelly = (body = {}) =>
  request(app)
    .post("/api/nodes")
    .send({ id: "jelly", name: "Jelly", url: "http://jelly:3001", ...body });

describe("GET /api/nodes", () => {
  it("lists the registry with live status", async () => {
    const res = await request(app).get("/api/nodes").expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: "pi5", status: "online" });
  });
});

describe("GET /api/nodes/fleet", () => {
  it("returns the overview payload", async () => {
    const res = await request(app).get("/api/nodes/fleet").expect(200);
    expect(res.body[0].summary).toBeDefined();
  });

  it("is not captured by the :id parameter route", async () => {
    // "/fleet" must resolve before "/:id/*".
    await request(app).get("/api/nodes/fleet").expect(200);
  });
});

describe("POST /api/nodes", () => {
  it("registers an agent and rebuilds the clients", async () => {
    const res = await addJelly().expect(201);
    expect(res.body).toMatchObject({ id: "jelly", url: "http://jelly:3001" });
    expect(manager.reconcile).toHaveBeenCalled();
  });

  it("stores a token without returning it", async () => {
    const res = await addJelly({ token: "s3cret" }).expect(201);
    expect(JSON.stringify(res.body)).not.toContain("s3cret");
    expect(res.body.hasToken).toBe(true);
  });

  it("rejects a duplicate id", async () => {
    await addJelly().expect(201);
    await addJelly().expect(409);
  });

  it("requires an id, name and URL", async () => {
    await request(app).post("/api/nodes").send({ name: "X", url: "http://x" }).expect(400);
    await request(app).post("/api/nodes").send({ id: "x", url: "http://x" }).expect(400);
    await request(app).post("/api/nodes").send({ id: "x", name: "X" }).expect(400);
  });

  it("rejects an id containing characters that break channel names", async () => {
    // Channel names are colon-delimited, so a colon in an id is ambiguous.
    await addJelly({ id: "jel:ly" }).expect(400);
    await addJelly({ id: "jel ly" }).expect(400);
  });

  it("rejects a non-http URL", async () => {
    await addJelly({ url: "ftp://jelly:3001" }).expect(400);
  });

  it("rejects a malformed URL", async () => {
    await addJelly({ url: "jelly:3001" }).expect(400);
  });

  it("strips a trailing slash from the URL", async () => {
    const res = await addJelly({ url: "http://jelly:3001/" }).expect(201);
    expect(res.body.url).toBe("http://jelly:3001");
  });
});

describe("PUT /api/nodes/:id", () => {
  it("updates a remote node", async () => {
    await addJelly();
    const res = await request(app)
      .put("/api/nodes/jelly")
      .send({ name: "Jelly Renamed", url: "http://jelly:3001" })
      .expect(200);

    expect(res.body.name).toBe("Jelly Renamed");
    expect(manager.reconcile).toHaveBeenCalled();
  });

  it("renames the local node without requiring a URL", async () => {
    const res = await request(app)
      .put("/api/nodes/pi5")
      .send({ name: "The Pi" })
      .expect(200);

    expect(res.body).toMatchObject({ name: "The Pi", url: null });
  });

  it("rejects an empty name on the local node", async () => {
    await request(app).put("/api/nodes/pi5").send({ name: "  " }).expect(400);
  });

  it("returns 404 for an unknown node", async () => {
    await request(app)
      .put("/api/nodes/ghost")
      .send({ name: "X", url: "http://x:3001" })
      .expect(404);
  });
});

describe("DELETE /api/nodes/:id", () => {
  it("removes a remote node", async () => {
    await addJelly();
    await request(app).delete("/api/nodes/jelly").expect(204);
    expect(NodeModel.getById("jelly")).toBeUndefined();
  });

  it("refuses to remove the hub's own node", async () => {
    await request(app).delete("/api/nodes/pi5").expect(400);
    expect(NodeModel.getById("pi5")).toBeDefined();
  });

  it("returns 404 for an unknown node", async () => {
    await request(app).delete("/api/nodes/ghost").expect(404);
  });
});

describe("metric proxy", () => {
  it("forwards a collector request to the node's client", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ cpu: 42 });
    manager.getClient.mockReturnValue({ fetch: fetchFn });

    const res = await request(app)
      .get("/api/nodes/jelly/metrics/system")
      .expect(200);

    expect(fetchFn).toHaveBeenCalledWith("metrics:system");
    expect(res.body).toEqual({ cpu: 42 });
  });

  it("returns 404 for an unknown metric", async () => {
    await request(app).get("/api/nodes/jelly/metrics/bogus").expect(404);
  });

  it("returns 404 when the node is not registered", async () => {
    manager.getClient.mockReturnValue(undefined);
    await request(app).get("/api/nodes/ghost/metrics/system").expect(404);
  });

  it("returns 502 when the agent does not answer", async () => {
    manager.getClient.mockReturnValue({
      fetch: vi.fn().mockRejectedValue(new Error("connect ETIMEDOUT 10.0.0.5")),
    });

    const res = await request(app)
      .get("/api/nodes/jelly/metrics/system")
      .expect(502);
    expect(JSON.stringify(res.body)).not.toContain("10.0.0.5");
  });
});

describe("container action proxy", () => {
  it("forwards the action to the node's client", async () => {
    const containerAction = vi.fn().mockResolvedValue({ success: true });
    manager.getClient.mockReturnValue({ containerAction });

    await request(app)
      .post("/api/nodes/jelly/docker/containers/abc/restart")
      .expect(200);

    expect(containerAction).toHaveBeenCalledWith("abc", "restart");
  });

  it("returns 404 when the node is unknown", async () => {
    manager.getClient.mockReturnValue(undefined);
    await request(app)
      .post("/api/nodes/ghost/docker/containers/abc/start")
      .expect(404);
  });
});

describe("POST /api/nodes/:id/test", () => {
  it("reports reachability and latency", async () => {
    manager.getClient.mockReturnValue({
      request: vi.fn().mockResolvedValue({ id: "jelly", role: "agent" }),
    });

    const res = await request(app).post("/api/nodes/jelly/test").expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.info.role).toBe("agent");
    expect(typeof res.body.latencyMs).toBe("number");
  });

  it("reports failure without throwing", async () => {
    manager.getClient.mockReturnValue({
      request: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    });

    const res = await request(app).post("/api/nodes/jelly/test").expect(200);
    expect(res.body.ok).toBe(false);
  });
});
