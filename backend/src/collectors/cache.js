/**
 * Single-flight TTL cache.
 *
 * Previously the REST routes and the WebSocket push loops each ran their own
 * copy of every collector, so a browser polling /api/metrics/processes while
 * a WebSocket pushed the same channel walked /proc twice per cycle. Wrapping a
 * collector here means concurrent callers share one in-flight promise and any
 * caller arriving inside the TTL gets the settled value for free.
 */
class SingleFlightCache {
  constructor() {
    /** @type {Map<string, {value: any, at: number}>} */
    this.entries = new Map();
    /** @type {Map<string, Promise<any>>} */
    this.inFlight = new Map();
  }

  /**
   * @param {string} key
   * @param {number} ttlMs - 0 disables caching but still coalesces concurrent calls
   * @param {() => Promise<any>} producer
   */
  async get(key, ttlMs, producer) {
    const cached = this.entries.get(key);
    if (cached && Date.now() - cached.at < ttlMs) {
      return cached.value;
    }

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const promise = (async () => {
      try {
        const value = await producer();
        this.entries.set(key, { value, at: Date.now() });
        return value;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  /** Latest value without triggering a fetch, or undefined. */
  peek(key) {
    return this.entries.get(key)?.value;
  }

  invalidate(key) {
    if (key === undefined) {
      this.entries.clear();
    } else {
      this.entries.delete(key);
    }
  }
}

module.exports = { SingleFlightCache, cache: new SingleFlightCache() };
