/**
 * This machine's own metrics.
 *
 * Mounted at /api/local on every node in either role. A hub calls these on its
 * agents; the hub also serves them for itself. Channel names map onto the path
 * by replacing ':' with '/', so `metrics:system` is /api/local/metrics/system.
 */
const express = require("express");
const logger = require("../utils/logger");

/**
 * @param {object} deps - injectable so routing can be tested without touching
 *   the host's real /proc, sysfs or Docker socket.
 */
module.exports = function createLocalRouter({
  collectors = require("../collectors"),
  dockerCollector = require("../collectors/docker"),
  config = require("../config"),
} = {}) {
  const router = express.Router();

  /** Identity, so a hub can confirm which machine answered. */
  router.get("/info", (req, res) => {
    res.json({
      id: config.node.id,
      name: config.node.name,
      role: config.role,
      channels: collectors.CHANNEL_NAMES,
    });
  });

  /**
   * Fetch a URL on the hub's behalf.
   *
   * A module may live on a network only this machine can see. The hub asks the
   * agent to make the request rather than needing a route to the service
   * itself. Restricted to http(s) so it cannot be turned into a file reader.
   */
  router.post("/proxy", async (req, res) => {
    const { url: target, token } = req.body ?? {};

    let parsed;
    try {
      parsed = new URL(String(target));
    } catch {
      return res.status(400).json({ error: "A valid url is required" });
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res.status(400).json({ error: "Only http and https are supported" });
    }

    try {
      const upstream = await fetch(parsed.href, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(8000),
      });
      if (!upstream.ok) {
        return res.status(502).json({ error: `Upstream responded ${upstream.status}` });
      }
      res.json(await upstream.json());
    } catch (error) {
      logger.debug({ err: error }, "Agent proxy request failed");
      res.status(502).json({ error: "Upstream did not respond" });
    }
  });

  // Container actions must be declared before the catch-all collector route.
  router.post("/docker/containers/:id/:action", async (req, res) => {
    const { id, action } = req.params;
    try {
      await dockerCollector.runContainerAction(id, action);
      logger.info({ containerId: id, action }, "Container action completed");
      res.json({ success: true, action, containerId: id });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) {
        logger.error({ err: error, containerId: id, action }, "Container action failed");
      }
      res.status(statusCode).json({
        error:
          statusCode === 400 ? "Invalid action" : `Failed to ${action} container`,
      });
    }
  });

  /**
   * Generic collector endpoint. `fresh=1` bypasses the TTL cache for callers
   * that need a guaranteed-current sample.
   */
  router.get("/*", async (req, res) => {
    const channel = req.params[0].replace(/\//g, ":");

    if (!collectors.isValidChannel(channel)) {
      return res.status(404).json({ error: "Unknown metric" });
    }

    try {
      const data = await collectors.collect(channel, {
        fresh: req.query.fresh === "1",
      });
      res.json(data);
    } catch (error) {
      logger.error({ err: error, channel }, "Collector error");
      res.status(500).json({ error: "Failed to collect metric" });
    }
  });

  return router;
};
