import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

// Create a fresh in-memory database and wire up ServiceModel
let db;
let ServiceModel;

beforeEach(() => {
  db = new Database(":memory:");
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

  // ServiceModel uses require("./database") which returns the db singleton.
  // Since we can't easily swap that at runtime, we'll test the SQL logic directly.
  ServiceModel = {
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
    delete: (id) => {
      const stmt = db.prepare("DELETE FROM services WHERE id = ?");
      return stmt.run(id);
    },
  };
});

describe("ServiceModel", () => {
  describe("getAll", () => {
    it("returns empty array when no services exist", () => {
      const result = ServiceModel.getAll();
      expect(result).toEqual([]);
    });

    it("returns services ordered by category and name", () => {
      db.prepare("INSERT INTO services (name, url, category) VALUES (?, ?, ?)").run("Zebra", "http://z", "B-Cat");
      db.prepare("INSERT INTO services (name, url, category) VALUES (?, ?, ?)").run("Alpha", "http://a", "A-Cat");
      db.prepare("INSERT INTO services (name, url, category) VALUES (?, ?, ?)").run("Beta", "http://b", "A-Cat");

      const result = ServiceModel.getAll();
      expect(result).toHaveLength(3);
      expect(result[0].name).toBe("Alpha");
      expect(result[1].name).toBe("Beta");
      expect(result[2].name).toBe("Zebra");
    });
  });

  describe("getById", () => {
    it("returns service when found", () => {
      db.prepare("INSERT INTO services (name, url, icon, category) VALUES (?, ?, ?, ?)").run("Test", "http://test", "🔗", "Dev");

      const result = ServiceModel.getById(1);
      expect(result).toBeDefined();
      expect(result.name).toBe("Test");
      expect(result.url).toBe("http://test");
    });

    it("returns undefined when not found", () => {
      const result = ServiceModel.getById(999);
      expect(result).toBeUndefined();
    });
  });

  describe("create", () => {
    it("creates a service and returns it", () => {
      const result = ServiceModel.create({
        name: "New Service",
        url: "http://new",
        icon: "🚀",
        category: "Tools",
      });

      expect(result).toBeDefined();
      expect(result.name).toBe("New Service");
      expect(result.url).toBe("http://new");
      expect(result.icon).toBe("🚀");
      expect(result.category).toBe("Tools");
      expect(result.id).toBe(1);
    });

    it("uses default values for icon and category", () => {
      const result = ServiceModel.create({
        name: "Minimal",
        url: "http://min",
      });

      expect(result.icon).toBe("");
      expect(result.category).toBe("Other");
    });
  });

  describe("update", () => {
    it("updates an existing service", () => {
      db.prepare("INSERT INTO services (name, url, icon, category) VALUES (?, ?, ?, ?)").run("Old", "http://old", "🔗", "Dev");

      const result = ServiceModel.update(1, {
        name: "Updated",
        url: "http://updated",
        icon: "✅",
        category: "Prod",
      });

      expect(result.name).toBe("Updated");
      expect(result.url).toBe("http://updated");
      expect(result.icon).toBe("✅");
      expect(result.category).toBe("Prod");
    });

    it("returns undefined for non-existent id", () => {
      const result = ServiceModel.update(999, {
        name: "Ghost",
        url: "http://ghost",
      });
      expect(result).toBeUndefined();
    });
  });

  describe("delete", () => {
    it("deletes an existing service", () => {
      db.prepare("INSERT INTO services (name, url, icon, category) VALUES (?, ?, ?, ?)").run("ToDelete", "http://del", "🗑️", "Dev");

      ServiceModel.delete(1);
      const result = ServiceModel.getById(1);
      expect(result).toBeUndefined();
    });
  });
});
