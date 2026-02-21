require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const http = require("http");
const logger = require("./utils/logger");

// Initialize database
require("./db/database");

// Import routes
const dockerRoutes = require("./routes/docker");
const metricsRoutes = require("./routes/metrics");
const servicesRoutes = require("./routes/services");

// Import WebSocket server
const WebSocketManager = require("./websocket/WebSocketServer");

const app = express();
const PORT = process.env.PORT || 3001;

// Create HTTP server (needed for WebSocket)
const server = http.createServer(app);

// Initialize WebSocket server
const wsManager = new WebSocketManager(server);

// Trust proxy (nginx frontend forwards X-Forwarded-For headers)
app.set("trust proxy", 1);

// Security middleware
app.use(helmet());

// CORS - restrict to known origins if CORS_ORIGIN is set
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin.split(",") } : undefined));

// Body size limits
app.use(express.json({ limit: "1mb" }));

// Rate limiting — tuned for dashboard polling (up to 9 requests per cycle)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const processesLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

app.use("/api", apiLimiter);
app.use("/api/metrics/processes", processesLimiter);

// Routes
app.use("/api/docker", dockerRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/api/services", servicesRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// WebSocket stats endpoint
app.get("/api/ws/stats", (req, res) => {
  res.json(wsManager.getStats());
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

// Graceful shutdown handler
const shutdown = (signal) => {
  logger.info({ signal }, "Starting graceful shutdown");

  // Stop WebSocket push loops
  wsManager.stop();

  // Close all WebSocket connections
  wsManager.wss.clients.forEach((client) => {
    client.close(1001, "Server shutting down");
  });
  wsManager.wss.close(() => {
    logger.info("WebSocket server closed");
  });

  // Close database connection
  try {
    const db = require("./db/database");
    db.close();
    logger.info("Database connection closed");
  } catch (err) {
    logger.error({ err }, "Error closing database");
  }

  // Drain HTTP server
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Start HTTP + WebSocket server
server.listen(PORT, "0.0.0.0", () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV || "development" }, "Homelab Portal Backend started");

  // Start WebSocket data push loops
  wsManager.start();
});
