const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dbPath = process.env.DB_PATH || "./data/homelab.db";
const dbDir = path.dirname(dbPath);

// Ensure data directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Initialize tables
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

// Insert default services if table is empty
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

module.exports = db;
