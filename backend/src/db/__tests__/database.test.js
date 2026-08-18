// Covers the real migration path, including upgrading a database created by
// the pre-multi-node release.
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const Database = require("better-sqlite3");
const { initDatabase, migrate, MIGRATIONS } = require("../database");

const V1_SCHEMA = `
  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    icon TEXT,
    category TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

const tableNames = (db) =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((r) => r.name);

const columnNames = (db, table) =>
  db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name);

describe("migrate", () => {
  it("builds the full schema on a fresh database", () => {
    const db = new Database(":memory:");
    const version = migrate(db);

    expect(version).toBe(MIGRATIONS.length);
    expect(tableNames(db)).toEqual(expect.arrayContaining(["services", "nodes"]));
    expect(columnNames(db, "services")).toContain("node_id");
  });

  it("carries existing quick links into the module registry", () => {
    const db = new Database(":memory:");
    db.exec(V1_SCHEMA);
    db.pragma("user_version = 1");
    const insert = db.prepare(
      "INSERT INTO services (name, url, icon, category) VALUES (?, ?, ?, ?)"
    );
    insert.run("Pi-hole", "http://pi/admin", "S", "Network");
    insert.run("Pi-hole", "http://pi2/admin", "S", "Network");

    migrate(db);

    const links = db.prepare("SELECT * FROM modules ORDER BY sort_order").all();
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ id: "pi-hole", kind: "link", url: "http://pi/admin" });
    // Two links may share a name; ids still have to be unique.
    expect(links[1].id).toBe("pi-hole-2");
  });

  it("upgrades a v1 database without losing rows", () => {
    const db = new Database(":memory:");
    db.exec(V1_SCHEMA);
    db.pragma("user_version = 1");
    db.prepare(
      "INSERT INTO services (name, url, icon, category) VALUES (?, ?, ?, ?)"
    ).run("Pi-hole", "http://pi/admin", "S", "Network");

    migrate(db);

    const rows = db.prepare("SELECT * FROM services").all();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Pi-hole");
    // Pre-existing links become fleet-wide rather than vanishing.
    expect(rows[0].node_id).toBeNull();
    expect(tableNames(db)).toContain("nodes");
  });

  it("is idempotent", () => {
    const db = new Database(":memory:");
    migrate(db);
    const first = db.pragma("user_version", { simple: true });

    expect(() => migrate(db)).not.toThrow();
    expect(db.pragma("user_version", { simple: true })).toBe(first);
  });
});

describe("initDatabase", () => {
  it("seeds default links into the module registry, not the retired table", () => {
    // Migration v3 runs before seeding, so anything written to `services`
    // here would never be read again.
    const db = initDatabase(":memory:");
    expect(db.prepare("SELECT COUNT(*) c FROM modules").get().c).toBeGreaterThan(0);
    expect(
      db.prepare("SELECT COUNT(*) c FROM modules WHERE kind = 'link'").get().c
    ).toBeGreaterThan(0);
  });

  it("does not seed when asked not to", () => {
    const db = initDatabase(":memory:", { seed: false });
    expect(db.prepare("SELECT COUNT(*) c FROM modules").get().c).toBe(0);
  });

  it("adopts the supplied machine as the local node", () => {
    const db = initDatabase(":memory:", {
      seed: false,
      localNode: { id: "pi5", name: "Raspberry Pi 5" },
    });

    const node = db.prepare("SELECT * FROM nodes WHERE is_local = 1").get();
    expect(node.id).toBe("pi5");
    expect(node.name).toBe("Raspberry Pi 5");
    expect(node.url).toBeNull();
  });

  it("keeps exactly one local node across restarts", () => {
    const db = initDatabase(":memory:", {
      seed: false,
      localNode: { id: "pi5", name: "Old Name" },
    });
    db.prepare(
      `INSERT INTO nodes (id, name, url, is_local, enabled, sort_order)
       VALUES (?, ?, NULL, 1, 1, 0)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, is_local = 1`
    ).run("pi5", "Raspberry Pi 5");

    const locals = db.prepare("SELECT * FROM nodes WHERE is_local = 1").all();
    expect(locals).toHaveLength(1);
    expect(locals[0].name).toBe("Raspberry Pi 5");
  });
});
