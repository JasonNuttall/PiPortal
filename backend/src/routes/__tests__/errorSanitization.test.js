// Tests that error responses from metrics and docker routes
// do not leak internal error details (error.message) to clients.

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const express = require("express");
const request = require("supertest");

// Build a minimal Express app that mirrors the error handling pattern
// from metrics.js and docker.js, confirming responses are generic.

function createMetricsApp() {
  const app = express();
  app.use(express.json());

  // Simulate the sanitized error pattern from metrics.js
  app.get("/api/metrics/system", async (req, res) => {
    try {
      throw new Error("internal CPU read failed at /sys/devices");
    } catch (error) {
      // This is what the code SHOULD do (and now does):
      res.status(500).json({ error: "Failed to fetch system metrics" });
    }
  });

  app.get("/api/metrics/temperature", async (req, res) => {
    try {
      throw new Error("thermal zone not accessible at /sys/class/thermal");
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch temperature" });
    }
  });

  app.get("/api/metrics/disk", async (req, res) => {
    try {
      throw new Error("mount table read failed at /proc/1/mounts");
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch disk metrics" });
    }
  });

  app.get("/api/metrics/network", async (req, res) => {
    try {
      throw new Error("network interface read error on eth0");
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch network metrics" });
    }
  });

  app.get("/api/metrics/processes", async (req, res) => {
    try {
      throw new Error("proc filesystem access denied");
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch processes" });
    }
  });

  app.get("/api/docker/containers", async (req, res) => {
    try {
      throw new Error("Cannot connect to Docker daemon at unix:///var/run/docker.sock");
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch Docker containers" });
    }
  });

  app.get("/api/docker/info", async (req, res) => {
    try {
      throw new Error("Docker daemon connection refused");
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch Docker info" });
    }
  });

  return app;
}

describe("Error response sanitization", () => {
  let app;

  beforeEach(() => {
    app = createMetricsApp();
  });

  const endpoints = [
    { path: "/api/metrics/system", error: "Failed to fetch system metrics", leaks: ["/sys/devices", "CPU read"] },
    { path: "/api/metrics/temperature", error: "Failed to fetch temperature", leaks: ["thermal zone", "/sys/class"] },
    { path: "/api/metrics/disk", error: "Failed to fetch disk metrics", leaks: ["/proc/1/mounts", "mount table"] },
    { path: "/api/metrics/network", error: "Failed to fetch network metrics", leaks: ["eth0", "interface read"] },
    { path: "/api/metrics/processes", error: "Failed to fetch processes", leaks: ["proc filesystem", "access denied"] },
    { path: "/api/docker/containers", error: "Failed to fetch Docker containers", leaks: ["docker.sock", "unix://"] },
    { path: "/api/docker/info", error: "Failed to fetch Docker info", leaks: ["daemon", "connection refused"] },
  ];

  endpoints.forEach(({ path, error, leaks }) => {
    it(`${path} returns generic error without internal details`, async () => {
      const res = await request(app).get(path);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe(error);
      // Must NOT contain a message field with internal error details
      expect(res.body.message).toBeUndefined();
      // Verify no internal details leak
      const body = JSON.stringify(res.body);
      leaks.forEach((leak) => {
        expect(body).not.toContain(leak);
      });
    });
  });
});

describe("Error response format verification against actual source files", () => {
  it("metrics.js error responses should not include message field", async () => {
    const fs = require("fs");
    const path = require("path");
    const metricsSource = fs.readFileSync(
      path.join(__dirname, "..", "metrics.js"),
      "utf8"
    );

    // Find all res.status(500).json patterns and ensure none include 'message:'
    const errorPatterns = metricsSource.match(/res\.status\(500\)\.json\(\{[^}]+\}\)/g) || [];
    expect(errorPatterns.length).toBeGreaterThan(0);
    errorPatterns.forEach((pattern) => {
      expect(pattern).not.toContain("message:");
      expect(pattern).not.toContain("error.message");
    });
  });

  it("docker.js error responses should not include message field", async () => {
    const fs = require("fs");
    const path = require("path");
    const dockerSource = fs.readFileSync(
      path.join(__dirname, "..", "docker.js"),
      "utf8"
    );

    const errorPatterns = dockerSource.match(/res\.status\(500\)\.json\(\{[^}]+\}\)/g) || [];
    expect(errorPatterns.length).toBeGreaterThan(0);
    errorPatterns.forEach((pattern) => {
      expect(pattern).not.toContain("message:");
      expect(pattern).not.toContain("error.message");
    });
  });
});
