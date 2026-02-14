require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const http = require("http");

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

// Security middleware
app.use(helmet());

// CORS - restrict to known origins if CORS_ORIGIN is set
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin.split(",") } : undefined));

// Body size limits
app.use(express.json({ limit: "1mb" }));

// Rate limiting for expensive endpoints
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const processesLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
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
  console.error("Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Start HTTP + WebSocket server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Homelab Portal Backend running on port ${PORT}`);
  console.log(`WebSocket server available at ws://0.0.0.0:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);

  // Start WebSocket data push loops
  wsManager.start();
});
