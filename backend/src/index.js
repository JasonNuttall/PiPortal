require("dotenv").config();
const express = require("express");
const cors = require("cors");
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

// Middleware
app.use(cors());
app.use(express.json());

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
