const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const SCHEMA = `
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

/**
 * Initialize a database connection with schema.
 * @param {string} dbPath - Path to database file, or ":memory:" for in-memory
 * @param {object} options
 * @param {boolean} options.seed - Whether to insert default data (default: true)
 * @returns {import("better-sqlite3").Database}
 */
function initDatabase(dbPath, { seed = true } = {}) {
  if (dbPath !== ":memory:") {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  }

  const db = new Database(dbPath);
  db.exec(SCHEMA);

  if (seed) {
    const count = db.prepare("SELECT COUNT(*) as count FROM services").get();
    if (count.count === 0) {
      const insert = db.prepare(`
        INSERT INTO services (name, url, icon, category)
        VALUES (?, ?, ?, ?)
      `);

      insert.run("Portainer", "http://raspberrypi:9000", "🐳", "Management");
      insert.run("Pi-hole", "http://raspberrypi/admin", "🛡️", "Network");
      insert.run("Grafana", "http://raspberrypi:3000", "📊", "Monitoring");
    }
  }

  return db;
}

const dbPath = process.env.DB_PATH || "./data/homelab.db";
const db = initDatabase(dbPath);

module.exports = db;
module.exports.initDatabase = initDatabase;
