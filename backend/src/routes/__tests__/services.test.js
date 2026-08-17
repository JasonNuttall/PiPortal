// Exercises the real services router and the real ServiceModel against an
// in-memory database.
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const express = require("express");
const request = require("supertest");
const { initDatabase, setDb } = require("../../db/database");

let app;
let db;

beforeEach(() => {
  db = initDatabase(":memory:", { seed: false });
  setDb(db);

  app = express();
  app.use(express.json());
  app.use("/api/services", require("../services"));
});

afterEach(() => {
  setDb(null);
  db.close();
});

const create = (body) => request(app).post("/api/services").send(body);

describe("GET /api/services", () => {
  it("returns an empty list initially", async () => {
    const res = await request(app).get("/api/services").expect(200);
    expect(res.body).toEqual([]);
  });

  it("filters by node, including fleet-wide links", async () => {
    await create({ name: "Global", url: "http://g" });
    await create({ name: "OnJelly", url: "http://j", nodeId: "jelly" });
    await create({ name: "OnPi", url: "http://p", nodeId: "pi5" });

    const res = await request(app)
      .get("/api/services?nodeId=jelly")
      .expect(200);

    expect(res.body.map((s) => s.name).sort()).toEqual(["Global", "OnJelly"]);
  });
});

describe("POST /api/services", () => {
  it("creates a service", async () => {
    const res = await create({
      name: "Jellyfin",
      url: "http://jelly:8096",
      icon: "M",
      category: "Media",
    }).expect(201);

    expect(res.body).toMatchObject({ name: "Jellyfin", url: "http://jelly:8096" });
  });

  it("associates a service with a node", async () => {
    const res = await create({
      name: "Jellyfin",
      url: "http://jelly:8096",
      nodeId: "jelly",
    }).expect(201);

    expect(res.body.node_id).toBe("jelly");
  });

  it("requires a name and a URL", async () => {
    await create({ url: "http://x" }).expect(400);
    await create({ name: "X" }).expect(400);
  });

  it("rejects a javascript: URL", async () => {
    const res = await create({
      name: "Bad",
      // eslint-disable-next-line no-script-url
      url: "javascript:alert(1)",
    }).expect(400);
    expect(res.body.error).toMatch(/http or https/i);
  });

  it("rejects a malformed URL", async () => {
    await create({ name: "Bad", url: "not a url" }).expect(400);
  });

  it("rejects an over-long name", async () => {
    await create({ name: "x".repeat(101), url: "http://x" }).expect(400);
  });

  it("rejects an over-long node id", async () => {
    await create({
      name: "X",
      url: "http://x",
      nodeId: "n".repeat(41),
    }).expect(400);
  });

  it("trims surrounding whitespace", async () => {
    const res = await create({
      name: "  Spaced  ",
      url: "  http://x  ",
    }).expect(201);
    expect(res.body.name).toBe("Spaced");
    expect(res.body.url).toBe("http://x");
  });
});

describe("PUT /api/services/:id", () => {
  it("updates a service", async () => {
    const created = await create({ name: "Old", url: "http://old" });
    const res = await request(app)
      .put(`/api/services/${created.body.id}`)
      .send({ name: "New", url: "http://new" })
      .expect(200);

    expect(res.body.name).toBe("New");
  });

  it("returns 404 for a missing service", async () => {
    await request(app)
      .put("/api/services/9999")
      .send({ name: "X", url: "http://x" })
      .expect(404);
  });

  it("validates on update too", async () => {
    const created = await create({ name: "Old", url: "http://old" });
    await request(app)
      .put(`/api/services/${created.body.id}`)
      .send({ name: "", url: "http://x" })
      .expect(400);
  });
});

describe("DELETE /api/services/:id", () => {
  it("deletes a service", async () => {
    const created = await create({ name: "Temp", url: "http://t" });
    await request(app).delete(`/api/services/${created.body.id}`).expect(204);
    await request(app).get(`/api/services/${created.body.id}`).expect(404);
  });
});

describe("error handling", () => {
  it("does not leak internals when the database is unavailable", async () => {
    setDb(null);
    const res = await request(app).get("/api/services").expect(500);
    expect(res.body.error).toBe("Failed to fetch services");
    expect(JSON.stringify(res.body)).not.toMatch(/initialised/i);
  });
});
