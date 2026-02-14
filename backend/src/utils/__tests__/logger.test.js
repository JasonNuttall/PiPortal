describe("logger", () => {
  it("exports a pino logger with standard methods", () => {
    const logger = require("../logger");

    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("has a valid log level", () => {
    const logger = require("../logger");
    const validLevels = ["fatal", "error", "warn", "info", "debug", "trace"];
    expect(validLevels).toContain(logger.level);
  });
});
