/**
 * Fleet registry and per-node data proxy (hub only).
 *
 *   GET    /api/nodes                       registry with live status
 *   GET    /api/nodes/fleet                 overview strip payload
 *   POST   /api/nodes                       register an agent
 *   PUT    /api/nodes/:id                   edit
 *   DELETE /api/nodes/:id                   remove (not the local node)
 *   POST   /api/nodes/:id/test              probe reachability
 *   GET    /api/nodes/:id/metrics/system    proxy a collector on that node
 *   POST   /api/nodes/:id/docker/containers/:cid/:action
 */
const express = require("express");
const logger = require("../utils/logger");
const NodeModel = require("../db/NodeModel");
const collectors = require("../collectors");
const { slugify } = require("../config");

const MAX_NAME_LENGTH = 60;
const MAX_URL_LENGTH = 300;

/**
 * @param {import("../nodes/NodeManager")} nodeManager
 */
module.exports = function createNodesRouter(nodeManager) {
  const router = express.Router();

  const validateNodeInput = ({ id, name, url, token }, { isUpdate = false } = {}) => {
    const errors = [];

    if (!isUpdate) {
      if (!id || typeof id !== "string" || !id.trim()) {
        errors.push("Node id is required");
      } else if (slugify(id) !== id.trim().toLowerCase()) {
        errors.push("Node id may contain only letters, numbers and hyphens");
      }
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      errors.push("Name is required");
    } else if (name.trim().length > MAX_NAME_LENGTH) {
      errors.push(`Name must be ${MAX_NAME_LENGTH} characters or fewer`);
    }

    if (!url || typeof url !== "string" || !url.trim()) {
      errors.push("URL is required");
    } else if (url.trim().length > MAX_URL_LENGTH) {
      errors.push(`URL must be ${MAX_URL_LENGTH} characters or fewer`);
    } else {
      try {
        const parsed = new URL(url.trim());
        if (!["http:", "https:"].includes(parsed.protocol)) {
          errors.push("URL must use http or https protocol");
        }
      } catch {
        errors.push("URL must be a valid URL (e.g. http://jelly:3001)");
      }
    }

    if (token !== undefined && token !== null && typeof token !== "string") {
      errors.push("Token must be a string");
    }

    if (errors.length > 0) return { valid: false, errors };

    return {
      valid: true,
      sanitized: {
        id: id ? slugify(id) : undefined,
        name: name.trim(),
        url: url.trim().replace(/\/+$/, ""),
        ...(token !== undefined ? { token: token || null } : {}),
      },
    };
  };

  router.get("/", (req, res) => {
    try {
      res.json(nodeManager.getNodes());
    } catch (error) {
      logger.error({ err: error }, "List nodes error");
      res.status(500).json({ error: "Failed to list nodes" });
    }
  });

  router.get("/fleet", async (req, res) => {
    try {
      res.json(await nodeManager.collectFleet());
    } catch (error) {
      logger.error({ err: error }, "Fleet overview error");
      res.status(500).json({ error: "Failed to build fleet overview" });
    }
  });

  router.post("/", (req, res) => {
    try {
      const { valid, errors, sanitized } = validateNodeInput(req.body);
      if (!valid) {
        return res.status(400).json({ error: errors.join(", ") });
      }
      if (NodeModel.getById(sanitized.id)) {
        return res.status(409).json({ error: "A node with that id already exists" });
      }

      const node = NodeModel.create(sanitized);
      nodeManager.reconcile();
      res.status(201).json(node);
    } catch (error) {
      logger.error({ err: error }, "Create node error");
      res.status(500).json({ error: "Failed to create node" });
    }
  });

  router.put("/:id", (req, res) => {
    try {
      const existing = NodeModel.getById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Node not found" });
      }

      if (existing.isLocal) {
        // The hub's own row has no URL to validate; only naming and ordering
        // are meaningful.
        const name = String(req.body.name ?? "").trim();
        if (!name || name.length > MAX_NAME_LENGTH) {
          return res.status(400).json({ error: "Name is required" });
        }
        const node = NodeModel.update(req.params.id, {
          name,
          sortOrder: req.body.sortOrder,
        });
        nodeManager.reconcile();
        return res.json(node);
      }

      const { valid, errors, sanitized } = validateNodeInput(req.body, {
        isUpdate: true,
      });
      if (!valid) {
        return res.status(400).json({ error: errors.join(", ") });
      }

      const node = NodeModel.update(req.params.id, {
        ...sanitized,
        enabled: req.body.enabled,
        sortOrder: req.body.sortOrder,
      });
      nodeManager.reconcile();
      res.json(node);
    } catch (error) {
      logger.error({ err: error }, "Update node error");
      res.status(500).json({ error: "Failed to update node" });
    }
  });

  router.delete("/:id", (req, res) => {
    try {
      const existing = NodeModel.getById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Node not found" });
      }
      if (existing.isLocal) {
        return res
          .status(400)
          .json({ error: "The hub's own node cannot be removed" });
      }

      NodeModel.delete(req.params.id);
      nodeManager.reconcile();
      res.status(204).send();
    } catch (error) {
      logger.error({ err: error }, "Delete node error");
      res.status(500).json({ error: "Failed to delete node" });
    }
  });

  /** Probe a node without registering it, so the UI can validate before saving. */
  router.post("/:id/test", async (req, res) => {
    const client = nodeManager.getClient(req.params.id);
    if (!client) {
      return res.status(404).json({ error: "Node not found" });
    }
    try {
      const started = Date.now();
      const info = client.request
        ? await client.request("/api/local/info")
        : { id: client.id, name: client.node.name, role: "hub" };
      res.json({ ok: true, latencyMs: Date.now() - started, info });
    } catch (error) {
      res.json({ ok: false, error: error.message });
    }
  });

  router.post(
    "/:id/docker/containers/:containerId/:action",
    async (req, res) => {
      const client = nodeManager.getClient(req.params.id);
      if (!client) {
        return res.status(404).json({ error: "Node not found" });
      }
      try {
        const result = await client.containerAction(
          req.params.containerId,
          req.params.action
        );
        res.json(result);
      } catch (error) {
        const statusCode = error.statusCode || 502;
        logger.error(
          { err: error, node: req.params.id, action: req.params.action },
          "Proxied container action failed"
        );
        res.status(statusCode).json({
          error: `Failed to ${req.params.action} container`,
        });
      }
    }
  );

  /** Proxy any collector channel on a specific node. */
  router.get("/:id/*", async (req, res) => {
    const channel = req.params[0].replace(/\//g, ":");

    if (!collectors.isValidChannel(channel)) {
      return res.status(404).json({ error: "Unknown metric" });
    }
    const client = nodeManager.getClient(req.params.id);
    if (!client) {
      return res.status(404).json({ error: "Node not found" });
    }

    try {
      res.json(await client.fetch(channel));
    } catch (error) {
      logger.error(
        { err: error, node: req.params.id, channel },
        "Node metric proxy failed"
      );
      res.status(502).json({ error: "Node did not respond" });
    }
  });

  return router;
};
