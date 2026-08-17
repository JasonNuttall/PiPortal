import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Keep the suite output readable; the logger is exercised on its own.
    env: {
      LOG_LEVEL: "silent",
      NODE_ROLE: "hub",
    },
  },
});
