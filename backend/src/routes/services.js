const express = require("express");
const ServiceModel = require("../db/models");
const router = express.Router();

// Validation limits
const MAX_NAME_LENGTH = 100;
const MAX_URL_LENGTH = 500;
const MAX_ICON_LENGTH = 10;
const MAX_CATEGORY_LENGTH = 50;

/**
 * Validate and sanitize service input fields.
 * Returns { valid, errors, sanitized } object.
 */
const validateServiceInput = ({ name, url, icon, category }) => {
  const errors = [];

  // Required fields
  if (!name || typeof name !== "string" || !name.trim()) {
    errors.push("Name is required");
  }
  if (!url || typeof url !== "string" || !url.trim()) {
    errors.push("URL is required");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const trimmedName = name.trim();
  const trimmedUrl = url.trim();
  const trimmedIcon = icon ? String(icon).trim() : null;
  const trimmedCategory = category ? String(category).trim() : null;

  // Length checks
  if (trimmedName.length > MAX_NAME_LENGTH) {
    errors.push(`Name must be ${MAX_NAME_LENGTH} characters or fewer`);
  }
  if (trimmedUrl.length > MAX_URL_LENGTH) {
    errors.push(`URL must be ${MAX_URL_LENGTH} characters or fewer`);
  }
  if (trimmedIcon && trimmedIcon.length > MAX_ICON_LENGTH) {
    errors.push(`Icon must be ${MAX_ICON_LENGTH} characters or fewer`);
  }
  if (trimmedCategory && trimmedCategory.length > MAX_CATEGORY_LENGTH) {
    errors.push(`Category must be ${MAX_CATEGORY_LENGTH} characters or fewer`);
  }

  // URL format validation - reject dangerous schemes
  try {
    const parsed = new URL(trimmedUrl);
    const allowedProtocols = ["http:", "https:"];
    if (!allowedProtocols.includes(parsed.protocol)) {
      errors.push("URL must use http or https protocol");
    }
  } catch {
    errors.push("URL must be a valid URL (e.g. https://example.com)");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    sanitized: {
      name: trimmedName,
      url: trimmedUrl,
      icon: trimmedIcon,
      category: trimmedCategory,
    },
  };
};

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
    const { valid, errors, sanitized } = validateServiceInput(req.body);
    if (!valid) {
      return res.status(400).json({ error: errors.join(", ") });
    }

    const service = ServiceModel.create(sanitized);
    res.status(201).json(service);
  } catch (error) {
    console.error("Create service error:", error.message);
    res.status(500).json({ error: "Failed to create service" });
  }
});

// Update service
router.put("/:id", (req, res) => {
  try {
    const { valid, errors, sanitized } = validateServiceInput(req.body);
    if (!valid) {
      return res.status(400).json({ error: errors.join(", ") });
    }

    const service = ServiceModel.update(req.params.id, sanitized);
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
