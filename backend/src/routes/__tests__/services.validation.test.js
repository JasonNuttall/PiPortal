// Tests for the input validation logic added to the Services API.
// Uses the same in-memory database pattern as services.test.js.

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const express = require("express");
const request = require("supertest");

// Replicate the validation function from services.js for direct unit testing
const MAX_NAME_LENGTH = 100;
const MAX_URL_LENGTH = 500;
const MAX_ICON_LENGTH = 10;
const MAX_CATEGORY_LENGTH = 50;

const validateServiceInput = ({ name, url, icon, category }) => {
  const errors = [];

  if (!name || typeof name !== "string" || !name.trim()) {
    errors.push("Name is required");
  }
  if (!url || typeof url !== "string" || !url.trim()) {
    errors.push("URL is required");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const trimmedName = name.trim();
  const trimmedUrl = url.trim();
  const trimmedIcon = icon ? String(icon).trim() : null;
  const trimmedCategory = category ? String(category).trim() : null;

  if (trimmedName.length > MAX_NAME_LENGTH) {
    errors.push(`Name must be ${MAX_NAME_LENGTH} characters or fewer`);
  }
  if (trimmedUrl.length > MAX_URL_LENGTH) {
    errors.push(`URL must be ${MAX_URL_LENGTH} characters or fewer`);
  }
  if (trimmedIcon && trimmedIcon.length > MAX_ICON_LENGTH) {
    errors.push(`Icon must be ${MAX_ICON_LENGTH} characters or fewer`);
  }
  if (trimmedCategory && trimmedCategory.length > MAX_CATEGORY_LENGTH) {
    errors.push(`Category must be ${MAX_CATEGORY_LENGTH} characters or fewer`);
  }

  try {
    const parsed = new URL(trimmedUrl);
    const allowedProtocols = ["http:", "https:"];
    if (!allowedProtocols.includes(parsed.protocol)) {
      errors.push("URL must use http or https protocol");
    }
  } catch {
    errors.push("URL must be a valid URL (e.g. https://example.com)");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    sanitized: {
      name: trimmedName,
      url: trimmedUrl,
      icon: trimmedIcon,
      category: trimmedCategory,
    },
  };
};

// --- Unit tests for validateServiceInput ---

describe("validateServiceInput - required fields", () => {
  it("rejects missing name", () => {
    const result = validateServiceInput({ url: "http://test.com" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Name is required");
  });

  it("rejects missing url", () => {
    const result = validateServiceInput({ name: "Test" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("URL is required");
  });

  it("rejects both missing", () => {
    const result = validateServiceInput({});
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Name is required");
    expect(result.errors).toContain("URL is required");
  });

  it("rejects empty string name", () => {
    const result = validateServiceInput({ name: "", url: "http://test.com" });
    expect(result.valid).toBe(false);
  });

  it("rejects whitespace-only name", () => {
    const result = validateServiceInput({ name: "   ", url: "http://test.com" });
    expect(result.valid).toBe(false);
  });

  it("rejects non-string name", () => {
    const result = validateServiceInput({ name: 123, url: "http://test.com" });
    expect(result.valid).toBe(false);
  });

  it("rejects null url", () => {
    const result = validateServiceInput({ name: "Test", url: null });
    expect(result.valid).toBe(false);
  });
});

describe("validateServiceInput - whitespace trimming", () => {
  it("trims name and url", () => {
    const result = validateServiceInput({
      name: "  My Service  ",
      url: "  https://example.com  ",
    });
    expect(result.valid).toBe(true);
    expect(result.sanitized.name).toBe("My Service");
    expect(result.sanitized.url).toBe("https://example.com");
  });

  it("trims icon and category", () => {
    const result = validateServiceInput({
      name: "Test",
      url: "https://test.com",
      icon: "  AB  ",
      category: "  Tools  ",
    });
    expect(result.valid).toBe(true);
    expect(result.sanitized.icon).toBe("AB");
    expect(result.sanitized.category).toBe("Tools");
  });

  it("sets icon and category to null when not provided", () => {
    const result = validateServiceInput({
      name: "Test",
      url: "https://test.com",
    });
    expect(result.valid).toBe(true);
    expect(result.sanitized.icon).toBeNull();
    expect(result.sanitized.category).toBeNull();
  });
});

describe("validateServiceInput - length limits", () => {
  it("accepts name at max length", () => {
    const result = validateServiceInput({
      name: "a".repeat(MAX_NAME_LENGTH),
      url: "https://test.com",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects name exceeding max length", () => {
    const result = validateServiceInput({
      name: "a".repeat(MAX_NAME_LENGTH + 1),
      url: "https://test.com",
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("100 characters");
  });

  it("rejects url exceeding max length", () => {
    const result = validateServiceInput({
      name: "Test",
      url: "https://test.com/" + "a".repeat(MAX_URL_LENGTH),
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("500 characters");
  });

  it("rejects icon exceeding max length", () => {
    const result = validateServiceInput({
      name: "Test",
      url: "https://test.com",
      icon: "a".repeat(MAX_ICON_LENGTH + 1),
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("10 characters");
  });

  it("rejects category exceeding max length", () => {
    const result = validateServiceInput({
      name: "Test",
      url: "https://test.com",
      category: "a".repeat(MAX_CATEGORY_LENGTH + 1),
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("50 characters");
  });
});

describe("validateServiceInput - URL format validation", () => {
  it("accepts http URLs", () => {
    const result = validateServiceInput({ name: "Test", url: "http://192.168.1.1:8080" });
    expect(result.valid).toBe(true);
  });

  it("accepts https URLs", () => {
    const result = validateServiceInput({ name: "Test", url: "https://example.com/path" });
    expect(result.valid).toBe(true);
  });

  it("rejects javascript: URIs", () => {
    const result = validateServiceInput({ name: "Test", url: "javascript:alert(1)" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("http or https"))).toBe(true);
  });

  it("rejects ftp: URLs", () => {
    const result = validateServiceInput({ name: "Test", url: "ftp://files.example.com" });
    expect(result.valid).toBe(false);
  });

  it("rejects data: URIs", () => {
    const result = validateServiceInput({ name: "Test", url: "data:text/html,<script>alert(1)</script>" });
    expect(result.valid).toBe(false);
  });

  it("rejects malformed URLs", () => {
    const result = validateServiceInput({ name: "Test", url: "not-a-url" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("valid URL"))).toBe(true);
  });

  it("accepts URLs with ports", () => {
    const result = validateServiceInput({ name: "Test", url: "http://localhost:3000" });
    expect(result.valid).toBe(true);
  });

  it("accepts URLs with paths and query strings", () => {
    const result = validateServiceInput({ name: "Test", url: "https://example.com/path?key=value" });
    expect(result.valid).toBe(true);
  });
});

// --- Integration tests: validation through the API ---

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

  const router = express.Router();

  router.post("/", (req, res) => {
    try {
      const { valid, errors, sanitized } = validateServiceInput(req.body);
      if (!valid) {
        return res.status(400).json({ error: errors.join(", ") });
      }
      const service = ServiceModel.create(sanitized);
      res.status(201).json(service);
    } catch (error) {
      res.status(500).json({ error: "Failed to create service" });
    }
  });

  router.put("/:id", (req, res) => {
    try {
      const { valid, errors, sanitized } = validateServiceInput(req.body);
      if (!valid) {
        return res.status(400).json({ error: errors.join(", ") });
      }
      const service = ServiceModel.update(req.params.id, sanitized);
      if (!service) return res.status(404).json({ error: "Service not found" });
      res.json(service);
    } catch (error) {
      res.status(500).json({ error: "Failed to update service" });
    }
  });

  const app = express();
  app.use(express.json());
  app.use("/api/services", router);
  return app;
}

describe("Services API - validation integration", () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  it("POST rejects javascript: URI with 400", async () => {
    const res = await request(app)
      .post("/api/services")
      .send({ name: "Evil", url: "javascript:alert(1)" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("http or https");
  });

  it("POST rejects oversized name with 400", async () => {
    const res = await request(app)
      .post("/api/services")
      .send({ name: "a".repeat(101), url: "https://test.com" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("100 characters");
  });

  it("POST trims whitespace on creation", async () => {
    const res = await request(app)
      .post("/api/services")
      .send({ name: "  Trimmed  ", url: "  https://test.com  " });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Trimmed");
    expect(res.body.url).toBe("https://test.com");
  });

  it("PUT rejects invalid URL with 400", async () => {
    const res = await request(app)
      .put("/api/services/1")
      .send({ name: "Test", url: "not-a-url" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("valid URL");
  });

  it("POST accepts valid service with all fields", async () => {
    const res = await request(app)
      .post("/api/services")
      .send({
        name: "Portainer",
        url: "https://192.168.1.1:9443",
        icon: "P",
        category: "Docker",
      });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Portainer");
  });
});
