/**
 * Module registry and data proxy (hub only).
 */
const express = require("express");
const logger = require("../utils/logger");
const ModuleModel = require("../db/ModuleModel");
const { slugify } = require("../config");
const { ContractError } = require("../modules/contract");

const MAX_NAME = 60;
const MAX_URL = 300;
const KINDS = ["native", "link"];

module.exports = function createModulesRouter(moduleManager) {
  const router = express.Router();

  const validate = (body, { isUpdate = false } = {}) => {
    const errors = [];
    const kind = body.kind ?? "native";

    if (!isUpdate) {
      if (!body.id || typeof body.id !== "string" || !body.id.trim()) {
        errors.push("Module id is required");
      } else if (slugify(body.id) !== body.id.trim().toLowerCase()) {
        errors.push("Module id may contain only letters, numbers and hyphens");
      }
    }

    if (!KINDS.includes(kind)) errors.push("Kind must be native or link");

    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      errors.push("Name is required");
    } else if (body.name.trim().length > MAX_NAME) {
      errors.push(`Name must be ${MAX_NAME} characters or fewer`);
    }

    if (!body.url || typeof body.url !== "string" || !body.url.trim()) {
      errors.push("URL is required");
    } else if (body.url.trim().length > MAX_URL) {
      errors.push(`URL must be ${MAX_URL} characters or fewer`);
    } else {
      try {
        const parsed = new URL(body.url.trim());
        if (!["http:", "https:"].includes(parsed.protocol)) {
          errors.push("URL must use http or https protocol");
        }
      } catch {
        errors.push("URL must be a valid URL (e.g. http://jelly:3014)");
      }
    }

    if (errors.length) return { valid: false, errors };

    return {
      valid: true,
      sanitized: {
        id: body.id ? slugify(body.id) : undefined,
        name: body.name.trim(),
        kind,
        url: body.url.trim().replace(/\/+$/, ""),
        icon: body.icon ? String(body.icon).trim().slice(0, 10) : null,
        category: body.category ? String(body.category).trim().slice(0, 50) : null,
        nodeId: body.nodeId ? String(body.nodeId).trim() : null,
        via: body.via ? String(body.via).trim() : "hub",
        ...(body.token !== undefined ? { token: body.token || null } : {}),
      },
    };
  };

  router.get("/", (req, res) => {
    try {
      res.json(moduleManager.getModules());
    } catch (error) {
      logger.error({ err: error }, "List modules error");
      res.status(500).json({ error: "Failed to list modules" });
    }
  });

  router.post("/", (req, res) => {
    try {
      const { valid, errors, sanitized } = validate(req.body);
      if (!valid) return res.status(400).json({ error: errors.join(", ") });
      if (ModuleModel.getById(sanitized.id)) {
        return res.status(409).json({ error: "A module with that id already exists" });
      }

      const created = ModuleModel.create(sanitized);
      moduleManager.reconcile();
      res.status(201).json(created);
    } catch (error) {
      logger.error({ err: error }, "Create module error");
      res.status(500).json({ error: "Failed to create module" });
    }
  });

  router.put("/:id", (req, res) => {
    try {
      if (!ModuleModel.getById(req.params.id)) {
        return res.status(404).json({ error: "Module not found" });
      }
      const { valid, errors, sanitized } = validate(req.body, { isUpdate: true });
      if (!valid) return res.status(400).json({ error: errors.join(", ") });

      const updated = ModuleModel.update(req.params.id, {
        ...sanitized,
        enabled: req.body.enabled,
        sortOrder: req.body.sortOrder,
      });
      moduleManager.reconcile();
      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, "Update module error");
      res.status(500).json({ error: "Failed to update module" });
    }
  });

  router.delete("/:id", (req, res) => {
    try {
      if (!ModuleModel.getById(req.params.id)) {
        return res.status(404).json({ error: "Module not found" });
      }
      ModuleModel.delete(req.params.id);
      moduleManager.reconcile();
      res.status(204).send();
    } catch (error) {
      logger.error({ err: error }, "Delete module error");
      res.status(500).json({ error: "Failed to delete module" });
    }
  });

  router.post("/:id/test", async (req, res) => {
    const client = moduleManager.getClient(req.params.id);
    if (!client) return res.status(404).json({ error: "Module not found" });
    res.json(await client.probe());
  });

  /**
   * Image proxy. Only URLs the module itself returned in its last payload are
   * fetchable, which keeps this from becoming an open relay into the network.
   */
  router.get("/:id/image", async (req, res) => {
    const client = moduleManager.getClient(req.params.id);
    if (!client) return res.status(404).json({ error: "Module not found" });

    const target = String(req.query.u ?? "");
    if (!client.isAllowedImage(target)) {
      return res.status(403).json({ error: "Image not referenced by this module" });
    }

    try {
      const upstream = await fetch(target, { signal: AbortSignal.timeout(8000) });
      if (!upstream.ok) return res.status(502).json({ error: "Image unavailable" });

      const type = upstream.headers.get("content-type") ?? "";
      if (!type.startsWith("image/")) {
        return res.status(415).json({ error: "Not an image" });
      }

      res.set("Content-Type", type);
      res.set("Cache-Control", "public, max-age=86400");
      res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      logger.debug({ err: error, module: req.params.id }, "Image proxy failed");
      res.status(502).json({ error: "Image unavailable" });
    }
  });

  /** Current payload, optionally for a window of a schedule. */
  router.get("/:id/data", async (req, res) => {
    const client = moduleManager.getClient(req.params.id);
    if (!client) return res.status(404).json({ error: "Module not found" });

    try {
      res.json(
        await client.fetch({ from: req.query.from, to: req.query.to })
      );
    } catch (error) {
      const contractIssue = error instanceof ContractError;
      if (!contractIssue) {
        logger.error({ err: error, module: req.params.id }, "Module fetch failed");
      }
      res.status(contractIssue ? 422 : 502).json({
        error: contractIssue ? error.message : "Module did not respond",
      });
    }
  });

  return router;
};
