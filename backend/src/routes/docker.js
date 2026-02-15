const express = require("express");
const Docker = require("dockerode");
const logger = require("../utils/logger");
const router = express.Router();

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

// Get all containers with their status
router.get("/containers", async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });

    const formattedContainers = containers.map((container) => ({
      id: container.Id.substring(0, 12),
      name: container.Names[0].replace("/", ""),
      image: container.Image,
      state: container.State,
      status: container.Status,
      created: container.Created,
      ports: container.Ports.map((p) => ({
        private: p.PrivatePort,
        public: p.PublicPort,
        type: p.Type,
      })),
    }));

    res.json(formattedContainers);
  } catch (error) {
    logger.error({ err: error }, "Docker API error");
    res.status(500).json({ error: "Failed to fetch Docker containers" });
  }
});

// Get Docker system info
router.get("/info", async (req, res) => {
  try {
    const info = await docker.info();
    res.json({
      containersRunning: info.ContainersRunning,
      containersPaused: info.ContainersPaused,
      containersStopped: info.ContainersStopped,
      images: info.Images,
      serverVersion: info.ServerVersion,
    });
  } catch (error) {
    logger.error({ err: error }, "Docker info error");
    res.status(500).json({ error: "Failed to fetch Docker info" });
  }
});

// Container actions: start, stop, restart
const ALLOWED_ACTIONS = ["start", "stop", "restart"];

router.post("/containers/:id/:action", async (req, res) => {
  const { id, action } = req.params;

  if (!ALLOWED_ACTIONS.includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  try {
    const container = docker.getContainer(id);
    await container[action]();
    logger.info({ containerId: id, action }, "Container action completed");
    res.json({ success: true, action, containerId: id });
  } catch (error) {
    logger.error({ err: error, containerId: id, action }, "Container action failed");
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: `Failed to ${action} container` });
  }
});

module.exports = router;
