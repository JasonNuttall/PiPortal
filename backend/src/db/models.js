const { getDb } = require("./database");

/**
 * Service quick-links.
 *
 * A link with node_id NULL is fleet-wide; one carrying a node_id belongs to
 * that machine and is shown when that node is in focus.
 */
class ServiceModel {
  static getAll({ nodeId } = {}) {
    if (nodeId === undefined) {
      return getDb()
        .prepare("SELECT * FROM services ORDER BY category, name")
        .all();
    }
    // Requesting a node's links includes the fleet-wide ones.
    return getDb()
      .prepare(
        `SELECT * FROM services
         WHERE node_id IS NULL OR node_id = ?
         ORDER BY category, name`
      )
      .all(nodeId);
  }

  static getById(id) {
    return getDb().prepare("SELECT * FROM services WHERE id = ?").get(id);
  }

  static create(service) {
    const result = getDb()
      .prepare(
        `INSERT INTO services (name, url, icon, category, node_id)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        service.name,
        service.url,
        service.icon || "",
        service.category || "Other",
        service.nodeId ?? null
      );
    return this.getById(result.lastInsertRowid);
  }

  static update(id, service) {
    getDb()
      .prepare(
        `UPDATE services
         SET name = ?, url = ?, icon = ?, category = ?, node_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(
        service.name,
        service.url,
        service.icon || "",
        service.category || "Other",
        service.nodeId ?? null,
        id
      );
    return this.getById(id);
  }

  static delete(id) {
    return getDb().prepare("DELETE FROM services WHERE id = ?").run(id);
  }
}

module.exports = ServiceModel;
