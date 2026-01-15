require("dotenv").config();
const express = require("express");
const cors = require("cors");

// Initialize database
require("./db/database");

// Import routes
const dockerRoutes = require("./routes/docker");
const metricsRoutes = require("./routes/metrics");
const servicesRoutes = require("./routes/services");

const app = express();
const PORT = process.env.PORT || 3001;

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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Homelab Portal Backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});
