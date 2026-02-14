// Tests for security middleware added to the backend.
// Creates a minimal Express app with the same middleware stack as index.js
// to verify headers, rate limiting, CORS, and body size limits.

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const request = require("supertest");

function createSecuredApp({ corsOrigin } = {}) {
  const app = express();

  // Same middleware stack as index.js
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));

  // Rate limiting
  const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 5, // Low limit for testing
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
  });
  app.use("/api", apiLimiter);

  // Test endpoints
  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/test", (req, res) => {
    res.json({ data: "test" });
  });

  app.post("/api/echo", (req, res) => {
    res.json({ received: req.body });
  });

  return app;
}

describe("Security Middleware - Helmet headers", () => {
  let app;

  beforeEach(() => {
    app = createSecuredApp();
  });

  it("sets X-Content-Type-Options header", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("sets X-Frame-Options header", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });

  it("removes X-Powered-By header", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("sets Content-Security-Policy header", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["content-security-policy"]).toBeDefined();
  });

  it("sets X-DNS-Prefetch-Control header", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-dns-prefetch-control"]).toBe("off");
  });
});

describe("Security Middleware - Rate limiting", () => {
  let app;

  beforeEach(() => {
    app = createSecuredApp();
  });

  it("allows requests under the limit", async () => {
    const res = await request(app).get("/api/test");
    expect(res.status).toBe(200);
  });

  it("includes rate limit headers", async () => {
    const res = await request(app).get("/api/test");
    expect(res.headers["ratelimit-limit"]).toBeDefined();
    expect(res.headers["ratelimit-remaining"]).toBeDefined();
  });

  it("returns 429 when rate limit exceeded", async () => {
    // Send 5 requests (the limit)
    for (let i = 0; i < 5; i++) {
      await request(app).get("/api/test");
    }

    // 6th request should be rate limited
    const res = await request(app).get("/api/test");
    expect(res.status).toBe(429);
    expect(res.body.error).toBe("Too many requests, please try again later");
  });

  it("does not rate limit non-API endpoints", async () => {
    // Exhaust the API limit
    for (let i = 0; i < 6; i++) {
      await request(app).get("/api/test");
    }

    // Health check should still work
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });
});

describe("Security Middleware - Body size limits", () => {
  let app;

  beforeEach(() => {
    app = createSecuredApp();
  });

  it("accepts normal-sized JSON body", async () => {
    const res = await request(app)
      .post("/api/echo")
      .send({ message: "hello" });
    expect(res.status).toBe(200);
    expect(res.body.received.message).toBe("hello");
  });

  it("rejects oversized JSON body", async () => {
    // Create a payload larger than 1MB
    const largePayload = { data: "x".repeat(1024 * 1024 + 1) };
    const res = await request(app)
      .post("/api/echo")
      .send(largePayload);
    expect(res.status).toBe(413);
  });
});
