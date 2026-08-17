// Exercises the real local router with injected collectors, so routing and
// error handling are covered without touching the host's /proc or Docker.
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const express = require("express");
const request = require("supertest");
const createLocalRouter = require("../local");

const buildApp = (overrides = {}) => {
  const collectors = {
    CHANNEL_NAMES: ["metrics:system", "metrics:disk", "docker:containers"],
    isValidChannel: (c) => collectors.CHANNEL_NAMES.includes(c),
    collect: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides.collectors,
  };
  const dockerCollector = {
    runContainerAction: vi.fn().mockResolvedValue(undefined),
    ...overrides.dockerCollector,
  };
  const config = {
    node: { id: "jelly", name: "Jelly" },
    role: "agent",
    ...overrides.config,
  };

  const app = express();
  app.use(express.json());
  app.use("/api/local", createLocalRouter({ collectors, dockerCollector, config }));
  return { app, collectors, dockerCollector };
};

describe("GET /api/local/info", () => {
  it("reports this machine's identity and channels", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/api/local/info").expect(200);

    expect(res.body).toMatchObject({ id: "jelly", name: "Jelly", role: "agent" });
    expect(res.body.channels).toContain("metrics:system");
  });
});

describe("collector routes", () => {
  it("maps a path onto a channel name", async () => {
    const { app, collectors } = buildApp();
    await request(app).get("/api/local/metrics/system").expect(200);

    expect(collectors.collect).toHaveBeenCalledWith("metrics:system", {
      fresh: false,
    });
  });

  it("maps a multi-segment path onto a colon-separated channel", async () => {
    const { app, collectors } = buildApp();
    await request(app).get("/api/local/docker/containers").expect(200);

    expect(collectors.collect).toHaveBeenCalledWith("docker:containers", {
      fresh: false,
    });
  });

  it("honours ?fresh=1 to bypass the cache", async () => {
    const { app, collectors } = buildApp();
    await request(app).get("/api/local/metrics/system?fresh=1").expect(200);

    expect(collectors.collect).toHaveBeenCalledWith("metrics:system", {
      fresh: true,
    });
  });

  it("returns 404 for an unknown metric", async () => {
    const { app, collectors } = buildApp();
    await request(app).get("/api/local/metrics/bogus").expect(404);
    expect(collectors.collect).not.toHaveBeenCalled();
  });

  it("returns a generic message when collection fails", async () => {
    const { app } = buildApp({
      collectors: {
        collect: vi
          .fn()
          .mockRejectedValue(new Error("thermal zone unreadable at /sys/foo")),
      },
    });

    const res = await request(app).get("/api/local/metrics/system").expect(500);
    // Internal paths must not reach the client.
    expect(JSON.stringify(res.body)).not.toContain("/sys/foo");
    expect(res.body.error).toBe("Failed to collect metric");
  });
});

describe("container actions", () => {
  it.each(["start", "stop", "restart"])("performs %s", async (action) => {
    const { app, dockerCollector } = buildApp();
    const res = await request(app)
      .post(`/api/local/docker/containers/abc123/${action}`)
      .expect(200);

    expect(dockerCollector.runContainerAction).toHaveBeenCalledWith(
      "abc123",
      action
    );
    expect(res.body).toMatchObject({ success: true, action });
  });

  it("rejects an action the collector refuses", async () => {
    const error = new Error("Invalid action");
    error.statusCode = 400;
    const { app } = buildApp({
      dockerCollector: { runContainerAction: vi.fn().mockRejectedValue(error) },
    });

    const res = await request(app)
      .post("/api/local/docker/containers/abc/destroy")
      .expect(400);
    expect(res.body.error).toBe("Invalid action");
  });

  it("does not leak Docker internals on failure", async () => {
    const { app } = buildApp({
      dockerCollector: {
        runContainerAction: vi
          .fn()
          .mockRejectedValue(new Error("connect EACCES /var/run/docker.sock")),
      },
    });

    const res = await request(app)
      .post("/api/local/docker/containers/abc/start")
      .expect(500);
    expect(JSON.stringify(res.body)).not.toContain("docker.sock");
  });

  it("is not shadowed by the catch-all collector route", async () => {
    // The wildcard GET must not swallow this POST path.
    const { app, dockerCollector } = buildApp();
    await request(app)
      .post("/api/local/docker/containers/abc/start")
      .expect(200);
    expect(dockerCollector.runContainerAction).toHaveBeenCalled();
  });
});
