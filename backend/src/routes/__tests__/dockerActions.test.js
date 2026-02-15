// Tests for Docker container action endpoints (start, stop, restart).
// Builds a minimal Express app with mock dockerode to test the route logic.

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const express = require("express");
const request = require("supertest");

function createDockerApp({ mockStart, mockStop, mockRestart } = {}) {
  const start = mockStart || vi.fn().mockResolvedValue();
  const stop = mockStop || vi.fn().mockResolvedValue();
  const restart = mockRestart || vi.fn().mockResolvedValue();

  const mockGetContainer = vi.fn().mockReturnValue({
    start,
    stop,
    restart,
  });

  const ALLOWED_ACTIONS = ["start", "stop", "restart"];

  const router = express.Router();

  router.post("/containers/:id/:action", async (req, res) => {
    const { id, action } = req.params;

    if (!ALLOWED_ACTIONS.includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    try {
      const container = mockGetContainer(id);
      await container[action]();
      res.json({ success: true, action, containerId: id });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({ error: `Failed to ${action} container` });
    }
  });

  const app = express();
  app.use(express.json());
  app.use("/api/docker", router);

  return { app, mockGetContainer, start, stop, restart };
}

describe("Docker Container Actions API", () => {
  describe("POST /api/docker/containers/:id/start", () => {
    it("starts a container successfully", async () => {
      const { app, mockGetContainer, start } = createDockerApp();

      const res = await request(app).post("/api/docker/containers/abc123/start");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.action).toBe("start");
      expect(res.body.containerId).toBe("abc123");
      expect(mockGetContainer).toHaveBeenCalledWith("abc123");
      expect(start).toHaveBeenCalled();
    });

    it("returns error when start fails", async () => {
      const error = new Error("container already started");
      error.statusCode = 304;
      const mockStart = vi.fn().mockRejectedValue(error);
      const { app } = createDockerApp({ mockStart });

      const res = await request(app).post("/api/docker/containers/abc123/start");
      expect(res.status).toBe(304);
    });
  });

  describe("POST /api/docker/containers/:id/stop", () => {
    it("stops a container successfully", async () => {
      const { app, stop } = createDockerApp();

      const res = await request(app).post("/api/docker/containers/abc123/stop");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.action).toBe("stop");
      expect(stop).toHaveBeenCalled();
    });

    it("returns error when container not found", async () => {
      const error = new Error("no such container");
      error.statusCode = 404;
      const mockStop = vi.fn().mockRejectedValue(error);
      const { app } = createDockerApp({ mockStop });

      const res = await request(app).post("/api/docker/containers/bad/stop");
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Failed to stop container");
    });
  });

  describe("POST /api/docker/containers/:id/restart", () => {
    it("restarts a container successfully", async () => {
      const { app, restart } = createDockerApp();

      const res = await request(app).post("/api/docker/containers/abc123/restart");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.action).toBe("restart");
      expect(restart).toHaveBeenCalled();
    });
  });

  describe("Invalid actions", () => {
    it("returns 400 for invalid action", async () => {
      const { app } = createDockerApp();

      const res = await request(app).post("/api/docker/containers/abc123/delete");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid action");
    });

    it("returns 400 for exec action", async () => {
      const { app } = createDockerApp();

      const res = await request(app).post("/api/docker/containers/abc123/exec");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid action");
    });
  });

  describe("Error response sanitization", () => {
    it("does not expose internal error message", async () => {
      const error = new Error("ECONNREFUSED 127.0.0.1:2375");
      error.statusCode = 500;
      const mockStart = vi.fn().mockRejectedValue(error);
      const { app } = createDockerApp({ mockStart });

      const res = await request(app).post("/api/docker/containers/abc123/start");
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to start container");
      expect(res.body.message).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain("ECONNREFUSED");
    });
  });
});
