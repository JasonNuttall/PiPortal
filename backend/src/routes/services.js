const express = require("express");
const ServiceModel = require("../db/models");
const router = express.Router();

// Get all services
router.get("/", (req, res) => {
  try {
    const services = ServiceModel.getAll();
    res.json(services);
  } catch (error) {
    console.error("Get services error:", error.message);
    res.status(500).json({ error: "Failed to fetch services" });
  }
});

// Get service by ID
router.get("/:id", (req, res) => {
  try {
    const service = ServiceModel.getById(req.params.id);
    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }
    res.json(service);
  } catch (error) {
    console.error("Get service error:", error.message);
    res.status(500).json({ error: "Failed to fetch service" });
  }
});

// Create new service
router.post("/", (req, res) => {
  try {
    const { name, url, icon, category } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: "Name and URL are required" });
    }

    const service = ServiceModel.create({ name, url, icon, category });
    res.status(201).json(service);
  } catch (error) {
    console.error("Create service error:", error.message);
    res.status(500).json({ error: "Failed to create service" });
  }
});

// Update service
router.put("/:id", (req, res) => {
  try {
    const { name, url, icon, category } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: "Name and URL are required" });
    }

    const service = ServiceModel.update(req.params.id, {
      name,
      url,
      icon,
      category,
    });
    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }
    res.json(service);
  } catch (error) {
    console.error("Update service error:", error.message);
    res.status(500).json({ error: "Failed to update service" });
  }
});

// Delete service
router.delete("/:id", (req, res) => {
  try {
    ServiceModel.delete(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error("Delete service error:", error.message);
    res.status(500).json({ error: "Failed to delete service" });
  }
});

module.exports = router;
