import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { SingleFlightCache } = require("../cache");

let cache;

beforeEach(() => {
  cache = new SingleFlightCache();
});

describe("SingleFlightCache", () => {
  it("returns a cached value inside the TTL without re-running the producer", async () => {
    const producer = vi.fn().mockResolvedValue("value");

    expect(await cache.get("k", 1000, producer)).toBe("value");
    expect(await cache.get("k", 1000, producer)).toBe("value");
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it("re-runs the producer once the TTL has elapsed", async () => {
    const producer = vi.fn().mockResolvedValue("value");

    await cache.get("k", 5, producer);
    await new Promise((resolve) => setTimeout(resolve, 15));
    await cache.get("k", 5, producer);

    expect(producer).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent callers onto one in-flight producer", async () => {
    // This is what stops the REST route and the WebSocket push loop from
    // walking /proc twice for the same tick.
    let resolveProducer;
    const producer = vi.fn(
      () => new Promise((resolve) => (resolveProducer = resolve))
    );

    const calls = [
      cache.get("k", 1000, producer),
      cache.get("k", 1000, producer),
      cache.get("k", 1000, producer),
    ];
    resolveProducer("shared");

    expect(await Promise.all(calls)).toEqual(["shared", "shared", "shared"]);
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it("coalesces even with a zero TTL", async () => {
    let resolveProducer;
    const producer = vi.fn(
      () => new Promise((resolve) => (resolveProducer = resolve))
    );

    const calls = [cache.get("k", 0, producer), cache.get("k", 0, producer)];
    resolveProducer("x");
    await Promise.all(calls);

    expect(producer).toHaveBeenCalledTimes(1);
  });

  it("does not cache a rejected producer", async () => {
    const producer = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue("recovered");

    await expect(cache.get("k", 1000, producer)).rejects.toThrow("boom");
    expect(await cache.get("k", 1000, producer)).toBe("recovered");
  });

  it("keeps separate keys independent", async () => {
    await cache.get("a", 1000, async () => 1);
    await cache.get("b", 1000, async () => 2);

    expect(cache.peek("a")).toBe(1);
    expect(cache.peek("b")).toBe(2);
  });

  it("peek does not trigger the producer", async () => {
    const producer = vi.fn().mockResolvedValue("v");
    expect(cache.peek("missing")).toBeUndefined();
    expect(producer).not.toHaveBeenCalled();
  });

  it("invalidate forces the next call to re-collect", async () => {
    const producer = vi.fn().mockResolvedValue("v");
    await cache.get("k", 10000, producer);
    cache.invalidate("k");
    await cache.get("k", 10000, producer);
    expect(producer).toHaveBeenCalledTimes(2);
  });
});
