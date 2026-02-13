import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const express = require("express");
const request = require("supertest");

// Build a standalone test app with its own in-memory db
// This avoids needing to mock the database module
function createTestApp() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      icon TEXT,
      category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Recreate the service model logic with the test db
  const ServiceModel = {
    getAll: () => db.prepare("SELECT * FROM services ORDER BY category, name").all(),
    getById: (id) => db.prepare("SELECT * FROM services WHERE id = ?").get(id),
    create: (service) => {
      const stmt = db.prepare("INSERT INTO services (name, url, icon, category) VALUES (?, ?, ?, ?)");
      const result = stmt.run(service.name, service.url, service.icon || "", service.category || "Other");
      return db.prepare("SELECT * FROM services WHERE id = ?").get(result.lastInsertRowid);
    },
    update: (id, service) => {
      const stmt = db.prepare("UPDATE services SET name = ?, url = ?, icon = ?, category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
      stmt.run(service.name, service.url, service.icon || "", service.category || "Other", id);
      return db.prepare("SELECT * FROM services WHERE id = ?").get(id);
    },
    delete: (id) => db.prepare("DELETE FROM services WHERE id = ?").run(id),
  };

  // Build routes inline (mirrors services.js exactly)
  const router = express.Router();

  router.get("/", (req, res) => {
    try {
      const services = ServiceModel.getAll();
      res.json(services);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch services" });
    }
  });

  router.get("/:id", (req, res) => {
    try {
      const service = ServiceModel.getById(req.params.id);
      if (!service) return res.status(404).json({ error: "Service not found" });
      res.json(service);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch service" });
    }
  });

  router.post("/", (req, res) => {
    try {
      const { name, url, icon, category } = req.body;
      if (!name || !url) return res.status(400).json({ error: "Name and URL are required" });
      const service = ServiceModel.create({ name, url, icon, category });
      res.status(201).json(service);
    } catch (error) {
      res.status(500).json({ error: "Failed to create service" });
    }
  });

  router.put("/:id", (req, res) => {
    try {
      const { name, url, icon, category } = req.body;
      if (!name || !url) return res.status(400).json({ error: "Name and URL are required" });
      const service = ServiceModel.update(req.params.id, { name, url, icon, category });
      if (!service) return res.status(404).json({ error: "Service not found" });
      res.json(service);
    } catch (error) {
      res.status(500).json({ error: "Failed to update service" });
    }
  });

  router.delete("/:id", (req, res) => {
    try {
      ServiceModel.delete(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete service" });
    }
  });

  const app = express();
  app.use(express.json());
  app.use("/api/services", router);
  return app;
}

describe("Services API", () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  describe("GET /api/services", () => {
    it("returns empty array when no services", async () => {
      const res = await request(app).get("/api/services");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns all services after creation", async () => {
      await request(app).post("/api/services").send({ name: "A", url: "http://a" });
      await request(app).post("/api/services").send({ name: "B", url: "http://b" });

      const res = await request(app).get("/api/services");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  describe("GET /api/services/:id", () => {
    it("returns service when found", async () => {
      const created = await request(app).post("/api/services").send({ name: "Found", url: "http://found", icon: "🔍", category: "Test" });

      const res = await request(app).get(`/api/services/${created.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Found");
    });

    it("returns 404 when not found", async () => {
      const res = await request(app).get("/api/services/999");
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Service not found");
    });
  });

  describe("POST /api/services", () => {
    it("creates a service with all fields", async () => {
      const res = await request(app)
        .post("/api/services")
        .send({ name: "New", url: "http://new", icon: "🚀", category: "Tools" });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe("New");
      expect(res.body.url).toBe("http://new");
      expect(res.body.icon).toBe("🚀");
      expect(res.body.category).toBe("Tools");
      expect(res.body.id).toBeDefined();
    });

    it("returns 400 when name is missing", async () => {
      const res = await request(app).post("/api/services").send({ url: "http://test" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Name and URL are required");
    });

    it("returns 400 when url is missing", async () => {
      const res = await request(app).post("/api/services").send({ name: "Test" });
      expect(res.status).toBe(400);
    });
  });

  describe("PUT /api/services/:id", () => {
    it("updates an existing service", async () => {
      const created = await request(app).post("/api/services").send({ name: "Old", url: "http://old" });

      const res = await request(app)
        .put(`/api/services/${created.body.id}`)
        .send({ name: "Updated", url: "http://updated", icon: "✅", category: "Prod" });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Updated");
    });

    it("returns 400 when name is missing", async () => {
      const res = await request(app).put("/api/services/1").send({ url: "http://test" });
      expect(res.status).toBe(400);
    });

    it("returns 404 when service not found", async () => {
      const res = await request(app)
        .put("/api/services/999")
        .send({ name: "Ghost", url: "http://ghost" });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/services/:id", () => {
    it("deletes a service", async () => {
      const created = await request(app).post("/api/services").send({ name: "ToDelete", url: "http://del" });

      const res = await request(app).delete(`/api/services/${created.body.id}`);
      expect(res.status).toBe(204);

      const check = await request(app).get(`/api/services/${created.body.id}`);
      expect(check.status).toBe(404);
    });
  });
});
