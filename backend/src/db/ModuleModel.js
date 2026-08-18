const { getDb } = require("./database");

/**
 * The module registry.
 *
 * A `native` module exposes a portal endpoint and reports datasets. A `link`
 * module is a quick link with nothing to report — the degenerate case, so
 * links and modules are one concept rather than two features.
 */
const toModule = (row) =>
  row && {
    id: row.id,
    name: row.name,
    kind: row.kind,
    adapter: row.adapter,
    url: row.url,
    icon: row.icon,
    category: row.category,
    nodeId: row.node_id,
    via: row.via,
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order,
    // The token is deliberately absent; see getToken().
    hasToken: Boolean(row.token),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

class ModuleModel {
  static getAll({ enabledOnly = false, nodeId } = {}) {
    const clauses = [];
    const params = [];

    if (enabledOnly) clauses.push("enabled = 1");
    if (nodeId !== undefined) {
      // A node's modules plus every fleet-wide one.
      clauses.push("(node_id IS NULL OR node_id = ?)");
      params.push(nodeId);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return getDb()
      .prepare(`SELECT * FROM modules ${where} ORDER BY sort_order, name`)
      .all(...params)
      .map(toModule);
  }

  static getById(id) {
    return toModule(getDb().prepare("SELECT * FROM modules WHERE id = ?").get(id));
  }

  static getToken(id) {
    return (
      getDb().prepare("SELECT token FROM modules WHERE id = ?").get(id)?.token ??
      null
    );
  }

  static create({
    id,
    name,
    kind = "native",
    adapter = null,
    url,
    icon = null,
    category = null,
    token = null,
    nodeId = null,
    via = "hub",
    enabled = true,
    sortOrder = 0,
  }) {
    getDb()
      .prepare(
        `INSERT INTO modules
           (id, name, kind, adapter, url, icon, category, token, node_id, via, enabled, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, name, kind, adapter, url, icon, category, token, nodeId, via, enabled ? 1 : 0, sortOrder);
    return this.getById(id);
  }

  /** Partial update. `token` is only written when the caller supplies the key. */
  static update(id, changes) {
    const existing = getDb().prepare("SELECT * FROM modules WHERE id = ?").get(id);
    if (!existing) return null;

    const next = {
      name: changes.name ?? existing.name,
      kind: changes.kind ?? existing.kind,
      adapter: changes.adapter === undefined ? existing.adapter : changes.adapter,
      url: changes.url ?? existing.url,
      icon: changes.icon === undefined ? existing.icon : changes.icon,
      category:
        changes.category === undefined ? existing.category : changes.category,
      token: "token" in changes ? changes.token : existing.token,
      nodeId: changes.nodeId === undefined ? existing.node_id : changes.nodeId,
      via: changes.via ?? existing.via,
      enabled:
        changes.enabled === undefined ? existing.enabled : changes.enabled ? 1 : 0,
      sortOrder: changes.sortOrder ?? existing.sort_order,
    };

    getDb()
      .prepare(
        `UPDATE modules
         SET name = ?, kind = ?, adapter = ?, url = ?, icon = ?, category = ?, token = ?,
             node_id = ?, via = ?, enabled = ?, sort_order = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(
        next.name, next.kind, next.adapter, next.url, next.icon, next.category, next.token,
        next.nodeId, next.via, next.enabled, next.sortOrder, id
      );

    return this.getById(id);
  }

  static delete(id) {
    return getDb().prepare("DELETE FROM modules WHERE id = ?").run(id);
  }
}

module.exports = ModuleModel;
module.exports.toModule = toModule;
