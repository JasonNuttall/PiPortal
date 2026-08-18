import { createRequire } from "module";
const require = createRequire(import.meta.url);

const express = require("express");
const request = require("supertest");
const { initDatabase, setDb } = require("../../db/database");
const ModuleModel = require("../../db/ModuleModel");
const createModulesRouter = require("../modules");

let app;
let db;
let manager;

beforeEach(() => {
  db = initDatabase(":memory:", { seed: false, localNode: { id: "pi5", name: "Pi" } });
  setDb(db);

  manager = {
    reconcile: vi.fn(),
    getModules: () => ModuleModel.getAll(),
    getClient: vi.fn(),
  };

  app = express();
  app.use(express.json());
  app.use("/api/modules", createModulesRouter(manager));
});

afterEach(() => {
  setDb(null);
  db.close();
});

const add = (body = {}) =>
  request(app)
    .post("/api/modules")
    .send({ id: "missedanep", name: "Missed an Ep", url: "http://jelly:3014", ...body });

describe("registry", () => {
  it("starts empty", async () => {
    const res = await request(app).get("/api/modules").expect(200);
    expect(res.body).toEqual([]);
  });

  it("registers a module", async () => {
    const res = await add().expect(201);
    expect(res.body).toMatchObject({ id: "missedanep", kind: "native" });
    expect(manager.reconcile).toHaveBeenCalled();
  });

  it("stores a token without returning it", async () => {
    const res = await add({ token: "mae_secret" }).expect(201);
    expect(JSON.stringify(res.body)).not.toContain("mae_secret");
    expect(res.body.hasToken).toBe(true);
    expect(ModuleModel.getToken("missedanep")).toBe("mae_secret");
  });

  it("rejects a duplicate id", async () => {
    await add().expect(201);
    await add().expect(409);
  });

  it("rejects an id that would break a channel name", async () => {
    await add({ id: "bad:id" }).expect(400);
    await add({ id: "bad id" }).expect(400);
  });

  it("rejects a non-http url", async () => {
    await add({ url: "ftp://jelly:3014" }).expect(400);
    await add({ url: "not a url" }).expect(400);
  });

  it("rejects an unknown kind", async () => {
    await add({ kind: "plugin" }).expect(400);
  });

  it("accepts a link module", async () => {
    const res = await add({ id: "portainer", name: "Portainer", kind: "link", url: "http://jelly:9443", icon: "P" }).expect(201);
    expect(res.body).toMatchObject({ kind: "link", icon: "P" });
  });

  it("updates a module without clearing its token", async () => {
    await add({ token: "mae_secret" });
    await request(app)
      .put("/api/modules/missedanep")
      .send({ name: "Renamed", url: "http://jelly:3014" })
      .expect(200);

    expect(ModuleModel.getToken("missedanep")).toBe("mae_secret");
    expect(ModuleModel.getById("missedanep").name).toBe("Renamed");
  });

  it("deletes a module", async () => {
    await add();
    await request(app).delete("/api/modules/missedanep").expect(204);
    expect(ModuleModel.getById("missedanep")).toBeUndefined();
  });

  it("404s for an unknown module", async () => {
    await request(app).put("/api/modules/ghost").send({ name: "X", url: "http://x" }).expect(404);
    await request(app).delete("/api/modules/ghost").expect(404);
  });
});

describe("data", () => {
  it("returns the module's payload", async () => {
    manager.getClient.mockReturnValue({
      fetch: vi.fn().mockResolvedValue({ contract: 1, datasets: [] }),
    });

    const res = await request(app).get("/api/modules/missedanep/data").expect(200);
    expect(res.body.contract).toBe(1);
  });

  it("passes a requested window through", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ contract: 1, datasets: [] });
    manager.getClient.mockReturnValue({ fetch: fetchFn });

    await request(app)
      .get("/api/modules/missedanep/data?from=2026-08-01&to=2026-08-31")
      .expect(200);

    expect(fetchFn).toHaveBeenCalledWith({ from: "2026-08-01", to: "2026-08-31" });
  });

  it("reports a contract violation as 422, distinctly from a dead service", async () => {
    const { ContractError } = require("../../modules/contract");
    manager.getClient.mockReturnValue({
      fetch: vi.fn().mockRejectedValue(new ContractError("Module speaks contract 9")),
    });

    const res = await request(app).get("/api/modules/missedanep/data").expect(422);
    expect(res.body.error).toMatch(/contract 9/);
  });

  it("reports an unreachable module as 502 without leaking the address", async () => {
    manager.getClient.mockReturnValue({
      fetch: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.9:3014")),
    });

    const res = await request(app).get("/api/modules/missedanep/data").expect(502);
    expect(JSON.stringify(res.body)).not.toContain("10.0.0.9");
  });
});

describe("image proxy", () => {
  it("refuses a URL the module never referenced", async () => {
    // Otherwise this is an open relay into the private network.
    manager.getClient.mockReturnValue({ isAllowedImage: () => false });

    const res = await request(app)
      .get("/api/modules/missedanep/image?u=http://192.168.1.1/admin")
      .expect(403);
    expect(res.body.error).toMatch(/not referenced/i);
  });

  it("404s for an unknown module", async () => {
    manager.getClient.mockReturnValue(undefined);
    await request(app).get("/api/modules/ghost/image?u=http://x/a.jpg").expect(404);
  });
});

describe("test", () => {
  it("reports a successful probe", async () => {
    manager.getClient.mockReturnValue({
      probe: vi.fn().mockResolvedValue({ ok: true, latencyMs: 4, info: {} }),
    });
    const res = await request(app).post("/api/modules/missedanep/test").expect(200);
    expect(res.body.ok).toBe(true);
  });

  it("404s for an unknown module", async () => {
    manager.getClient.mockReturnValue(undefined);
    await request(app).post("/api/modules/ghost/test").expect(404);
  });
});
