/**
 * SQLite connection and schema migrations.
 *
 * Migrations are keyed off PRAGMA user_version so an existing single-node
 * deployment upgrades in place: the node registry is added and the machine
 * already running the portal is adopted as the local node.
 */
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

/**
 * Ordered migrations. Index + 1 is the resulting user_version, so entries may
 * be appended but never reordered or removed.
 * @type {Array<(db: import("better-sqlite3").Database) => void>}
 */
const MIGRATIONS = [
  // v1 - original single-node schema
  (db) => {
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
  },

  // v2 - multi-node: node registry, and services may be scoped to a node
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT,
        token TEXT,
        is_local INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Service links belong to a node when they are that machine's own web UI.
    // NULL means the link is fleet-wide, which is how every pre-existing row
    // is treated so nothing disappears on upgrade.
    const columns = db.prepare("PRAGMA table_info(services)").all();
    if (!columns.some((c) => c.name === "node_id")) {
      db.exec("ALTER TABLE services ADD COLUMN node_id TEXT");
    }

    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_services_node ON services(node_id)"
    );
  },

  // v3 - modules: services with something to report, plus the plain links
  // that used to live in their own table
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS modules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'native',
        url TEXT,
        icon TEXT,
        category TEXT,
        token TEXT,
        node_id TEXT,
        via TEXT NOT NULL DEFAULT 'hub',
        enabled INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_modules_node ON modules(node_id)");

    // Quick Links become link modules, so there is one registry rather than
    // two. The services table is left in place, unread, so a rollback still
    // finds its data.
    const services = db.prepare("SELECT * FROM services ORDER BY id").all();
    const insert = db.prepare(
      `INSERT OR IGNORE INTO modules
         (id, name, kind, url, icon, category, node_id, via, sort_order)
       VALUES (?, ?, 'link', ?, ?, ?, ?, 'hub', ?)`
    );

    const used = new Set();
    services.forEach((service, index) => {
      const base =
        String(service.name)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40) || "link";

      // Two links may share a name; ids must stay unique.
      let id = base;
      let suffix = 2;
      while (used.has(id)) id = `${base}-${suffix++}`;
      used.add(id);

      insert.run(
        id,
        service.name,
        service.url,
        service.icon || null,
        service.category || null,
        service.node_id ?? null,
        index
      );
    });
  },
];

/**
 * Apply any migrations the database has not yet seen.
 * @returns {number} the resulting schema version
 */
function migrate(db) {
  const current = db.pragma("user_version", { simple: true });

  for (let version = current; version < MIGRATIONS.length; version++) {
    const migration = MIGRATIONS[version];
    const apply = db.transaction(() => {
      migration(db);
      // user_version does not accept a bound parameter.
      db.pragma(`user_version = ${version + 1}`);
    });
    apply();
  }

  return db.pragma("user_version", { simple: true });
}

/**
 * Open (and if needed create) a database.
 * @param {string} dbPath - file path, or ":memory:"
 * @param {{seed?: boolean, localNode?: {id: string, name: string}}} options
 */
function initDatabase(dbPath, { seed = true, localNode = null } = {}) {
  if (dbPath !== ":memory:") {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  }

  const db = new Database(dbPath);

  // WAL lets the metrics reads proceed while a service write is in flight.
  if (dbPath !== ":memory:") {
    db.pragma("journal_mode = WAL");
  }
  db.pragma("foreign_keys = ON");

  migrate(db);

  if (localNode) {
    // The hub's own machine is always node row `is_local = 1`.
    db.prepare(
      `INSERT INTO nodes (id, name, url, is_local, enabled, sort_order)
       VALUES (?, ?, NULL, 1, 1, 0)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, is_local = 1`
    ).run(localNode.id, localNode.name);
  }

  if (seed) {
    // Seed the registry, not the retired services table — migration v3 has
    // already run by this point, so anything written there would never be read.
    const { count } = db.prepare("SELECT COUNT(*) as count FROM modules").get();
    if (count === 0) {
      const insert = db.prepare(
        `INSERT INTO modules (id, name, kind, url, icon, category, sort_order)
         VALUES (?, ?, 'link', ?, ?, ?, ?)`
      );
      insert.run("portainer", "Portainer", "http://raspberrypi:9000", "🐳", "Management", 0);
      insert.run("pi-hole", "Pi-hole", "http://raspberrypi/admin", "🛡️", "Network", 1);
      insert.run("grafana", "Grafana", "http://raspberrypi:3000", "📊", "Monitoring", 2);
    }
  }

  return db;
}

/**
 * The connection is created explicitly at startup rather than as an import
 * side effect, so tests can install an in-memory database and exercise the
 * real models instead of reimplementing their SQL.
 */
let instance = null;

/** @returns {import("better-sqlite3").Database} */
function getDb() {
  if (!instance) {
    throw new Error(
      "Database has not been initialised. Call init() during startup."
    );
  }
  return instance;
}

/** Test seam: install a database (or null to clear). */
function setDb(db) {
  instance = db;
}

/** Open the configured database and adopt this machine as the local node. */
function init(config = require("../config")) {
  instance = initDatabase(config.dbPath, { localNode: config.node });
  return instance;
}

function close() {
  instance?.close();
  instance = null;
}

module.exports = {
  initDatabase,
  migrate,
  MIGRATIONS,
  getDb,
  setDb,
  init,
  close,
};
