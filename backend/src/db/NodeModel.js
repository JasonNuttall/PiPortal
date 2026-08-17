const { getDb } = require("./database");

/**
 * The fleet registry.
 *
 * Exactly one row has is_local = 1: the machine the hub itself runs on, which
 * is collected in-process rather than over the network. Every other row is an
 * agent reached over HTTP/WebSocket at `url`.
 */
const toNode = (row) =>
  row && {
    id: row.id,
    name: row.name,
    url: row.url,
    isLocal: Boolean(row.is_local),
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order,
    // token is deliberately not exposed; see getToken()
    hasToken: Boolean(row.token),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

class NodeModel {
  static getAll({ enabledOnly = false } = {}) {
    const where = enabledOnly ? "WHERE enabled = 1" : "";
    return getDb()
      .prepare(
        `SELECT * FROM nodes ${where}
         ORDER BY is_local DESC, sort_order ASC, name ASC`
      )
      .all()
      .map(toNode);
  }

  static getById(id) {
    return toNode(getDb().prepare("SELECT * FROM nodes WHERE id = ?").get(id));
  }

  static getLocal() {
    return toNode(
      getDb().prepare("SELECT * FROM nodes WHERE is_local = 1").get()
    );
  }

  /** Secrets stay out of API responses, so they are read on their own. */
  static getToken(id) {
    return (
      getDb().prepare("SELECT token FROM nodes WHERE id = ?").get(id)?.token ??
      null
    );
  }

  static create({ id, name, url, token = null, enabled = true, sortOrder = 0 }) {
    getDb()
      .prepare(
        `INSERT INTO nodes (id, name, url, token, is_local, enabled, sort_order)
         VALUES (?, ?, ?, ?, 0, ?, ?)`
      )
      .run(id, name, url, token, enabled ? 1 : 0, sortOrder);
    return this.getById(id);
  }

  /**
   * Partial update. `token` is only written when the caller supplies the key,
   * so a normal edit does not wipe a stored secret it never received.
   */
  static update(id, changes) {
    const existing = getDb()
      .prepare("SELECT * FROM nodes WHERE id = ?")
      .get(id);
    if (!existing) return null;

    const next = {
      name: changes.name ?? existing.name,
      // The local node has no URL and must not be given one.
      url: existing.is_local ? null : changes.url ?? existing.url,
      enabled:
        changes.enabled === undefined
          ? existing.enabled
          : changes.enabled
            ? 1
            : 0,
      sortOrder: changes.sortOrder ?? existing.sort_order,
      token: "token" in changes ? changes.token : existing.token,
    };

    getDb()
      .prepare(
        `UPDATE nodes
         SET name = ?, url = ?, token = ?, enabled = ?, sort_order = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(next.name, next.url, next.token, next.enabled, next.sortOrder, id);

    return this.getById(id);
  }

  /** The local node is the hub itself and cannot be removed. */
  static delete(id) {
    return getDb()
      .prepare("DELETE FROM nodes WHERE id = ? AND is_local = 0")
      .run(id);
  }
}

module.exports = NodeModel;
module.exports.toNode = toNode;
