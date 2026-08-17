/**
 * Optional shared-secret auth.
 *
 * When AGENT_TOKEN is unset (the default) this is a no-op, which keeps a
 * single-machine LAN install zero-config. When it is set, every /api request
 * and every WebSocket upgrade must present it — that is the mode to use when
 * an agent is reachable beyond a trusted network.
 */
const crypto = require("crypto");

/** Constant-time compare that tolerates differing lengths. */
const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

const extractToken = (req) => {
  const header = req.headers?.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  // Browsers cannot set headers on a WebSocket handshake.
  if (req.url?.includes("token=")) {
    try {
      const url = new URL(req.url, "http://localhost");
      return url.searchParams.get("token");
    } catch {
      return null;
    }
  }
  return null;
};

const createAuthMiddleware = (expectedToken) => {
  if (!expectedToken) return (req, res, next) => next();

  return (req, res, next) => {
    const provided = extractToken(req);
    if (provided && safeEqual(provided, expectedToken)) {
      return next();
    }
    res.status(401).json({ error: "Unauthorized" });
  };
};

const createTokenVerifier = (expectedToken) => {
  if (!expectedToken) return null;
  return (req) => {
    const provided = extractToken(req);
    return Boolean(provided && safeEqual(provided, expectedToken));
  };
};

module.exports = {
  createAuthMiddleware,
  createTokenVerifier,
  extractToken,
  safeEqual,
};
