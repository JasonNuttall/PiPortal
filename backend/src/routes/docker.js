const express = require("express");
const Docker = require("dockerode");
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
    console.error("Docker API error:", error.message);
    res.status(500).json({
      error: "Failed to fetch Docker containers",
      message: error.message,
    });
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
    console.error("Docker info error:", error.message);
    res.status(500).json({
      error: "Failed to fetch Docker info",
      message: error.message,
    });
  }
});

module.exports = router;
