const db = require("./database");

class ServiceModel {
  static getAll() {
    return db.prepare("SELECT * FROM services ORDER BY category, name").all();
  }

  static getById(id) {
    return db.prepare("SELECT * FROM services WHERE id = ?").get(id);
  }

  static create(service) {
    const stmt = db.prepare(`
      INSERT INTO services (name, url, icon, category)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(
      service.name,
      service.url,
      service.icon || "",
      service.category || "Other"
    );
    return this.getById(result.lastInsertRowid);
  }

  static update(id, service) {
    const stmt = db.prepare(`
      UPDATE services 
      SET name = ?, url = ?, icon = ?, category = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(
      service.name,
      service.url,
      service.icon || "",
      service.category || "Other",
      id
    );
    return this.getById(id);
  }

  static delete(id) {
    const stmt = db.prepare("DELETE FROM services WHERE id = ?");
    return stmt.run(id);
  }
}

module.exports = ServiceModel;
