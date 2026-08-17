require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const http = require("http");
const compression = require("compression");

const config = require("./config");
const logger = require("./utils/logger");
const collectors = require("./collectors");
const { createAuthMiddleware, createTokenVerifier } = require("./middleware/auth");
const WebSocketManager = require("./websocket/WebSocketServer");

const app = express();
const server = http.createServer(app);

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors(config.corsOrigin ? { origin: config.corsOrigin.split(",") } : undefined));
// Metric payloads are large, repetitive JSON; gzip pays for itself over a LAN.
app.use(compression());
app.use(express.json({ limit: "1mb" }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const processesLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

app.use("/api", apiLimiter);
app.use("/api/local/metrics/processes", processesLimiter);

app.use("/api", createAuthMiddleware(config.authToken));

// Every node serves its own metrics, in both roles.
app.use("/api/local", require("./routes/local")());

/**
 * The data source behind the WebSocket server differs by role: a hub fans in
 * from every registered node, an agent reports only itself.
 */
let source;
let nodeManager = null;

if (config.isHub) {
  const database = require("./db/database");
  database.init(config);

  const NodeManager = require("./nodes/NodeManager");
  nodeManager = new NodeManager({ timeoutMs: config.agentTimeoutMs });
  source = nodeManager;

  app.use("/api/nodes", require("./routes/nodes")(nodeManager));
  app.use("/api/services", require("./routes/services"));
} else {
  const AgentSource = require("./websocket/AgentSource");
  source = new AgentSource(config.node);
}

const wsManager = new WebSocketManager(server, source, {
  verifyToken: createTokenVerifier(config.authToken),
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    role: config.role,
    node: config.node.id,
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/ws/stats", (req, res) => {
  res.json(wsManager.getStats());
});

app.use((err, req, res, next) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

let shuttingDown = false;

const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Starting graceful shutdown");

  wsManager.stop();
  wsManager.wss.clients.forEach((client) => client.close(1001, "Server shutting down"));
  wsManager.wss.close(() => logger.info("WebSocket server closed"));

  nodeManager?.stop();
  collectors.stop();

  if (config.isHub) {
    try {
      require("./db/database").close();
      logger.info("Database connection closed");
    } catch (err) {
      logger.error({ err }, "Error closing database");
    }
  }

  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });

  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// A port clash otherwise surfaces only as a repeating "WebSocket: server
// error", which says nothing about the actual problem or how to fix it.
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    logger.fatal(
      { port: config.port },
      `Port ${config.port} is already in use. Another Homelab Portal process ` +
        `(hub or agent) is probably already running on this machine. Stop it, ` +
        `or set PORT to a free port.`
    );
  } else {
    logger.fatal({ err }, "HTTP server failed to start");
  }
  process.exit(1);
});

server.listen(config.port, "0.0.0.0", () => {
  logger.info(
    {
      port: config.port,
      role: config.role,
      node: config.node.id,
      env: config.env,
      auth: config.authToken ? "enabled" : "disabled",
    },
    "Homelab Portal backend started"
  );

  // Docker's event stream replaces periodic container polling.
  collectors.start();
  nodeManager?.start();
  wsManager.start();
});

module.exports = { app, server, wsManager, nodeManager };
