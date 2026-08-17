import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

/**
 * Exercises the real module. The previous version asserted a string against
 * itself and never imported the code it claimed to cover.
 */
let sockets;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.sent = [];
    sockets.push(this);
  }

  send(payload) {
    this.sent.push(JSON.parse(payload));
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  /* -- helpers for driving the socket from a test -- */
  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  deliver(channel, data, timestamp = 1) {
    this.onmessage?.({
      data: JSON.stringify({ type: "data", channel, data, timestamp }),
    });
  }

  /** Every channel name this socket was asked to subscribe to. */
  get subscribed() {
    return this.sent
      .filter((m) => m.type === "subscribe")
      .flatMap((m) => m.channels);
  }

  get unsubscribed() {
    return this.sent
      .filter((m) => m.type === "unsubscribe")
      .flatMap((m) => m.channels);
  }
}

/** Fresh module state per test, since the connection is a module singleton. */
const loadModule = async () => {
  vi.resetModules();
  return import("../useWebSocket");
};

beforeEach(() => {
  sockets = [];
  globalThis.WebSocket = MockWebSocket;
  vi.stubGlobal("location", {
    protocol: "http:",
    host: "raspberrypi:1781",
    hostname: "raspberrypi",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("connection", () => {
  it("connects to /ws on the page's own origin", async () => {
    const { useWebSocket } = await loadModule();
    renderHook(() => useWebSocket());

    expect(sockets[0].url).toBe("ws://raspberrypi:1781/ws");
  });

  it("uses wss when the page is served over TLS", async () => {
    vi.stubGlobal("location", {
      protocol: "https:",
      host: "home.example.com",
      hostname: "home.example.com",
    });

    const { useWebSocket } = await loadModule();
    renderHook(() => useWebSocket());

    expect(sockets[0].url).toBe("wss://home.example.com/ws");
  });

  it("reports the connection state", async () => {
    const { useWebSocket } = await loadModule();
    const { result } = renderHook(() => useWebSocket());

    expect(result.current.isConnected).toBe(false);
    act(() => sockets[0].open());
    await waitFor(() => expect(result.current.isConnected).toBe(true));
  });

  it("shares one socket across hook instances", async () => {
    const { useWebSocket } = await loadModule();
    renderHook(() => useWebSocket());
    renderHook(() => useWebSocket());

    expect(sockets).toHaveLength(1);
  });
});

describe("subscriptions", () => {
  it("subscribes on the server when the first listener appears", async () => {
    const { useWebSocket } = await loadModule();
    const { result } = renderHook(() => useWebSocket());
    act(() => sockets[0].open());

    act(() => {
      result.current.subscribe("node:pi5:metrics:system", vi.fn());
    });

    expect(sockets[0].subscribed).toContain("node:pi5:metrics:system");
  });

  it("subscribes only once for several listeners on one channel", async () => {
    const { useWebSocket } = await loadModule();
    const { result } = renderHook(() => useWebSocket());
    act(() => sockets[0].open());

    act(() => {
      result.current.subscribe("node:pi5:metrics:system", vi.fn());
      result.current.subscribe("node:pi5:metrics:system", vi.fn());
    });

    const count = sockets[0].subscribed.filter(
      (c) => c === "node:pi5:metrics:system"
    ).length;
    expect(count).toBe(1);
  });

  it("unsubscribes only when the last listener goes away", async () => {
    const { useWebSocket } = await loadModule();
    const { result } = renderHook(() => useWebSocket());
    act(() => sockets[0].open());

    let releaseA;
    let releaseB;
    act(() => {
      releaseA = result.current.subscribe("node:pi5:metrics:system", vi.fn());
      releaseB = result.current.subscribe("node:pi5:metrics:system", vi.fn());
    });

    act(() => releaseA());
    expect(sockets[0].unsubscribed).not.toContain("node:pi5:metrics:system");

    act(() => releaseB());
    expect(sockets[0].unsubscribed).toContain("node:pi5:metrics:system");
  });

  it("routes a payload to that channel's listeners only", async () => {
    const { useWebSocket } = await loadModule();
    const { result } = renderHook(() => useWebSocket());
    act(() => sockets[0].open());

    const onSystem = vi.fn();
    const onProcesses = vi.fn();
    act(() => {
      result.current.subscribe("node:pi5:metrics:system", onSystem);
      result.current.subscribe("node:pi5:metrics:processes", onProcesses);
    });

    act(() => sockets[0].deliver("node:pi5:metrics:system", { cpu: 5 }, 42));

    expect(onSystem).toHaveBeenCalledWith({ cpu: 5 }, 42);
    expect(onProcesses).not.toHaveBeenCalled();
  });

  it("replays the last value to a listener that arrives late", async () => {
    const { useWebSocket } = await loadModule();
    const { result } = renderHook(() => useWebSocket());
    act(() => sockets[0].open());

    act(() => result.current.subscribe("node:pi5:metrics:system", vi.fn()));
    act(() => sockets[0].deliver("node:pi5:metrics:system", { cpu: 7 }));

    const late = vi.fn();
    act(() => result.current.subscribe("node:pi5:metrics:system", late));

    expect(late).toHaveBeenCalledWith({ cpu: 7 }, expect.any(Number));
  });

  it("re-subscribes everything after a reconnect", async () => {
    const { useWebSocket } = await loadModule();
    const { result } = renderHook(() => useWebSocket());
    act(() => sockets[0].open());
    act(() => result.current.subscribe("node:pi5:metrics:system", vi.fn()));

    act(() => sockets[0].close());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });

    expect(sockets.length).toBeGreaterThan(1);
    act(() => sockets[1].open());
    expect(sockets[1].subscribed).toContain("node:pi5:metrics:system");
  });

  it("ignores a malformed frame without tearing down the connection", async () => {
    const { useWebSocket } = await loadModule();
    const { result } = renderHook(() => useWebSocket());
    act(() => sockets[0].open());

    const listener = vi.fn();
    act(() => result.current.subscribe("node:pi5:metrics:system", listener));

    act(() => sockets[0].onmessage?.({ data: "not json" }));

    expect(listener).not.toHaveBeenCalled();
    expect(result.current.isConnected).toBe(true);
  });
});

describe("useWebSocketChannel", () => {
  it("exposes the latest payload for its channel", async () => {
    const { useWebSocket, useWebSocketChannel } = await loadModule();
    const connection = renderHook(() => useWebSocket());
    act(() => sockets[0].open());
    await waitFor(() =>
      expect(connection.result.current.isConnected).toBe(true)
    );

    const { result } = renderHook(() =>
      useWebSocketChannel("node:pi5:metrics:system")
    );

    act(() => sockets[0].deliver("node:pi5:metrics:system", { cpu: 9 }, 77));

    await waitFor(() => {
      expect(result.current.data).toEqual({ cpu: 9 });
      expect(result.current.lastUpdate).toBe(77);
    });
  });

  it("does not subscribe while disabled", async () => {
    const { useWebSocket, useWebSocketChannel } = await loadModule();
    renderHook(() => useWebSocket());
    act(() => sockets[0].open());

    renderHook(() => useWebSocketChannel("node:pi5:metrics:system", false));

    expect(sockets[0].subscribed).not.toContain("node:pi5:metrics:system");
  });
});
