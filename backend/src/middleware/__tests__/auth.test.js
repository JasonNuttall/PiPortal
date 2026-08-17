import { createRequire } from "module";
const require = createRequire(import.meta.url);

const express = require("express");
const request = require("supertest");
const {
  createAuthMiddleware,
  createTokenVerifier,
  extractToken,
  safeEqual,
} = require("../auth");

const buildApp = (token) => {
  const app = express();
  app.use("/api", createAuthMiddleware(token));
  app.get("/api/thing", (req, res) => res.json({ ok: true }));
  return app;
};

describe("safeEqual", () => {
  it("matches identical strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
  });

  it("rejects different strings", () => {
    expect(safeEqual("abc", "abd")).toBe(false);
  });

  it("rejects different lengths without throwing", () => {
    // timingSafeEqual throws on length mismatch if not guarded.
    expect(() => safeEqual("short", "muchlongervalue")).not.toThrow();
    expect(safeEqual("short", "muchlongervalue")).toBe(false);
  });
});

describe("extractToken", () => {
  it("reads a bearer header", () => {
    expect(
      extractToken({ headers: { authorization: "Bearer abc123" } })
    ).toBe("abc123");
  });

  it("reads a query parameter, which is how browsers authenticate a socket", () => {
    expect(extractToken({ headers: {}, url: "/?token=abc123" })).toBe("abc123");
  });

  it("returns null when nothing is supplied", () => {
    expect(extractToken({ headers: {}, url: "/" })).toBeNull();
  });

  it("ignores a non-bearer authorization scheme", () => {
    expect(extractToken({ headers: { authorization: "Basic abc" } })).toBeNull();
  });
});

describe("createAuthMiddleware", () => {
  it("allows everything when no token is configured", async () => {
    await request(buildApp(null)).get("/api/thing").expect(200);
  });

  it("rejects a request with no credentials", async () => {
    await request(buildApp("secret")).get("/api/thing").expect(401);
  });

  it("rejects a wrong token", async () => {
    await request(buildApp("secret"))
      .get("/api/thing")
      .set("Authorization", "Bearer wrong")
      .expect(401);
  });

  it("accepts the configured token", async () => {
    await request(buildApp("secret"))
      .get("/api/thing")
      .set("Authorization", "Bearer secret")
      .expect(200);
  });

  it("does not leak the expected token in the error body", async () => {
    const res = await request(buildApp("secret")).get("/api/thing").expect(401);
    expect(JSON.stringify(res.body)).not.toContain("secret");
  });
});

describe("createTokenVerifier", () => {
  it("returns null when auth is disabled, so upgrades are unrestricted", () => {
    expect(createTokenVerifier(null)).toBeNull();
  });

  it("verifies a socket upgrade carrying a query token", () => {
    const verify = createTokenVerifier("secret");
    expect(verify({ headers: {}, url: "/?token=secret" })).toBe(true);
    expect(verify({ headers: {}, url: "/?token=nope" })).toBe(false);
  });
});
