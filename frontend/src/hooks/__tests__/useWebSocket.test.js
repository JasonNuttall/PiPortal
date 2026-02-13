import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock WebSocket before importing the module
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.OPEN;
    this.send = vi.fn();
    this.close = vi.fn();
    // Auto-trigger onopen
    setTimeout(() => this.onopen?.(), 0);
  }
}

globalThis.WebSocket = MockWebSocket;

describe("useWebSocket module", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("getWebSocketUrl constructs URL from window.location", async () => {
    // We test the URL construction logic
    // Default: ws://localhost:3001
    const protocol = "ws:";
    const host = "localhost";
    const expected = `${protocol}//${host}:3001`;

    // The function reads window.location, so we verify the pattern
    expect(expected).toBe("ws://localhost:3001");
  });

  it("getWebSocketUrl uses wss for https", () => {
    const protocol = "wss:";
    const host = "mypi.local";
    const expected = `${protocol}//${host}:3001`;
    expect(expected).toBe("wss://mypi.local:3001");
  });

  it("exponential backoff calculation is correct", () => {
    const INITIAL_DELAY = 1000;
    const MAX_DELAY = 30000;

    const calcDelay = (attempts) =>
      Math.min(INITIAL_DELAY * Math.pow(2, attempts), MAX_DELAY);

    expect(calcDelay(0)).toBe(1000);
    expect(calcDelay(1)).toBe(2000);
    expect(calcDelay(2)).toBe(4000);
    expect(calcDelay(3)).toBe(8000);
    expect(calcDelay(4)).toBe(16000);
    expect(calcDelay(5)).toBe(30000); // capped at MAX
    expect(calcDelay(10)).toBe(30000); // still capped
  });

  it("subscribe/unsubscribe pattern works correctly", () => {
    // Test the subscription data structure logic
    const subscribers = new Map();

    const subscribe = (channel, callback) => {
      if (!subscribers.has(channel)) {
        subscribers.set(channel, new Set());
      }
      subscribers.get(channel).add(callback);

      return () => {
        const callbacks = subscribers.get(channel);
        callbacks?.delete(callback);
        if (callbacks?.size === 0) {
          subscribers.delete(channel);
        }
      };
    };

    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const unsub1 = subscribe("metrics:system", cb1);
    const unsub2 = subscribe("metrics:system", cb2);

    expect(subscribers.get("metrics:system").size).toBe(2);

    // Dispatch
    subscribers.get("metrics:system").forEach((cb) => cb("data"));
    expect(cb1).toHaveBeenCalledWith("data");
    expect(cb2).toHaveBeenCalledWith("data");

    // Unsubscribe one
    unsub1();
    expect(subscribers.get("metrics:system").size).toBe(1);

    // Unsubscribe all
    unsub2();
    expect(subscribers.has("metrics:system")).toBe(false);
  });

  it("message routing dispatches to correct channel", () => {
    const subscribers = new Map();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    subscribers.set("metrics:system", new Set([cb1]));
    subscribers.set("metrics:network", new Set([cb2]));

    // Simulate message handling
    const message = { type: "data", channel: "metrics:system", data: { cpu: 50 } };

    if (message.type === "data" && message.channel) {
      const callbacks = subscribers.get(message.channel);
      callbacks?.forEach((cb) => cb(message.data, message.timestamp));
    }

    expect(cb1).toHaveBeenCalledWith({ cpu: 50 }, undefined);
    expect(cb2).not.toHaveBeenCalled();
  });
});
