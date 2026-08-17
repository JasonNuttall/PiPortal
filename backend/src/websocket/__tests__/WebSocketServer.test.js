// Integration test over a real socket: the demand-driven contract is the whole
// point of the rewrite, so it is verified against actual client connections.
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const http = require("http");
const { EventEmitter } = require("events");
const WebSocket = require("ws");
const WebSocketManager = require("../WebSocketServer");

/** Minimal stand-in for NodeManager / AgentSource. */
class FakeSource extends EventEmitter {
  constructor() {
    super();
    this.demand = [];
    this.cache = new Map();
    this.channels = [
      "node:pi5:metrics:system",
      "node:pi5:metrics:processes",
      "node:jelly:metrics:system",
      "fleet",
    ];
  }
  getAvailableChannels() {
    return this.channels;
  }
  isValidChannel(c) {
    return this.channels.includes(c);
  }
  peek(c) {
    return this.cache.get(c);
  }
  setDemand(channels) {
    this.demand = [...channels].sort();
  }
  start() {}
  stop() {}
  produce(channel, data) {
    this.emit("data", channel, data, 999);
  }
}

let server;
let manager;
let source;
let port;

const connect = () =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });

/** Wait for the next message matching a predicate. */
const nextMessage = (ws, predicate = () => true, timeoutMs = 1500) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timed out waiting for message")),
      timeoutMs
    );
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());
      if (predicate(message)) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        resolve(message);
      }
    };
    ws.on("message", onMessage);
  });

const subscribe = async (ws, channels) => {
  const done = nextMessage(ws, (m) => m.type === "subscribed");
  ws.send(JSON.stringify({ type: "subscribe", channels }));
  return done;
};

/** Let the server process queued socket events. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

beforeEach(async () => {
  server = http.createServer();
  source = new FakeSource();
  manager = new WebSocketManager(server, source);
  manager.start();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
});

afterEach(async () => {
  manager.stop();
  for (const client of manager.wss.clients) client.terminate();
  await new Promise((resolve) => server.close(resolve));
});

describe("connection", () => {
  it("greets a client with the available channels", async () => {
    const ws = await connect();
    const message = await nextMessage(ws, (m) => m.type === "connected");

    expect(message.clientId).toBeDefined();
    expect(message.channels).toContain("node:pi5:metrics:system");
    ws.close();
  });

  it("answers a ping", async () => {
    const ws = await connect();
    await nextMessage(ws, (m) => m.type === "connected");

    const pong = nextMessage(ws, (m) => m.type === "pong");
    ws.send(JSON.stringify({ type: "ping" }));
    expect((await pong).timestamp).toBeDefined();
    ws.close();
  });

  it("reports invalid JSON without dropping the connection", async () => {
    const ws = await connect();
    await nextMessage(ws, (m) => m.type === "connected");

    const error = nextMessage(ws, (m) => m.type === "error");
    ws.send("not json");
    expect((await error).code).toBe("INVALID_JSON");
    ws.close();
  });

  it("rejects an unknown message type", async () => {
    const ws = await connect();
    await nextMessage(ws, (m) => m.type === "connected");

    const error = nextMessage(ws, (m) => m.type === "error");
    ws.send(JSON.stringify({ type: "explode" }));
    expect((await error).code).toBe("UNKNOWN_TYPE");
    ws.close();
  });
});

describe("demand propagation", () => {
  it("asks the source for nothing while no one is subscribed", async () => {
    const ws = await connect();
    await nextMessage(ws, (m) => m.type === "connected");
    await settle();

    expect(source.demand).toEqual([]);
    ws.close();
  });

  it("pushes demand down when a client subscribes", async () => {
    const ws = await connect();
    await nextMessage(ws, (m) => m.type === "connected");

    await subscribe(ws, ["node:pi5:metrics:system"]);
    await settle();

    expect(source.demand).toEqual(["node:pi5:metrics:system"]);
    ws.close();
  });

  it("rejects an unknown channel but keeps the valid ones", async () => {
    const ws = await connect();
    await nextMessage(ws, (m) => m.type === "connected");

    const result = await subscribe(ws, [
      "node:pi5:metrics:system",
      "node:ghost:metrics:system",
    ]);

    expect(result.channels).toEqual(["node:pi5:metrics:system"]);
    expect(result.invalid).toEqual(["node:ghost:metrics:system"]);
    ws.close();
  });

  it("keeps demand while a second client still wants the channel", async () => {
    const a = await connect();
    const b = await connect();
    await nextMessage(a, (m) => m.type === "connected");
    await nextMessage(b, (m) => m.type === "connected");

    await subscribe(a, ["node:pi5:metrics:system"]);
    await subscribe(b, ["node:pi5:metrics:system"]);

    a.close();
    await settle();

    expect(source.demand).toEqual(["node:pi5:metrics:system"]);
    b.close();
  });

  it("drops demand once the last subscriber disconnects", async () => {
    const ws = await connect();
    await nextMessage(ws, (m) => m.type === "connected");
    await subscribe(ws, ["node:pi5:metrics:system"]);

    ws.close();
    await settle();

    expect(source.demand).toEqual([]);
  });

  it("drops demand on explicit unsubscribe", async () => {
    const ws = await connect();
    await nextMessage(ws, (m) => m.type === "connected");
    await subscribe(ws, ["node:pi5:metrics:system"]);

    const done = nextMessage(ws, (m) => m.type === "unsubscribed");
    ws.send(
      JSON.stringify({
        type: "unsubscribe",
        channels: ["node:pi5:metrics:system"],
      })
    );
    await done;
    await settle();

    expect(source.demand).toEqual([]);
    ws.close();
  });
});

describe("data delivery", () => {
  it("sends a cached value immediately on subscribe", async () => {
    source.cache.set("node:pi5:metrics:system", {
      data: { cpu: { currentLoad: 5 } },
      timestamp: 111,
    });

    const ws = await connect();
    await nextMessage(ws, (m) => m.type === "connected");

    const data = nextMessage(ws, (m) => m.type === "data");
    ws.send(
      JSON.stringify({ type: "subscribe", channels: ["node:pi5:metrics:system"] })
    );

    const message = await data;
    expect(message.data).toEqual({ cpu: { currentLoad: 5 } });
    expect(message.timestamp).toBe(111);
    ws.close();
  });

  it("delivers a significant change to a subscriber", async () => {
    const ws = await connect();
    await nextMessage(ws, (m) => m.type === "connected");
    await subscribe(ws, ["node:pi5:metrics:system"]);

    source.produce("node:pi5:metrics:system", {
      cpu: { currentLoad: 10 },
      memory: { usedPercentage: 20 },
    });

    const first = await nextMessage(ws, (m) => m.type === "data");
    expect(first.data.cpu.currentLoad).toBe(10);
    ws.close();
  });

  it("suppresses an insignificant change", async () => {
    const ws = await connect();
    await nextMessage(ws, (m) => m.type === "connected");
    await subscribe(ws, ["node:pi5:metrics:system"]);

    source.produce("node:pi5:metrics:system", {
      cpu: { currentLoad: 10 },
      memory: { usedPercentage: 20 },
    });
    await nextMessage(ws, (m) => m.type === "data");

    const received = [];
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === "data") received.push(m);
    });

    // Well under the 5% threshold for metrics:system.
    source.produce("node:pi5:metrics:system", {
      cpu: { currentLoad: 10.2 },
      memory: { usedPercentage: 20 },
    });
    await settle();

    expect(received).toHaveLength(0);
    ws.close();
  });

  it("does not deliver a channel a client did not subscribe to", async () => {
    const ws = await connect();
    await nextMessage(ws, (m) => m.type === "connected");
    await subscribe(ws, ["node:pi5:metrics:system"]);

    const received = [];
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === "data") received.push(m.channel);
    });

    source.produce("node:jelly:metrics:system", { cpu: { currentLoad: 90 } });
    await settle();

    expect(received).not.toContain("node:jelly:metrics:system");
    ws.close();
  });

  it("tracks each node's change history separately", async () => {
    const ws = await connect();
    await nextMessage(ws, (m) => m.type === "connected");
    await subscribe(ws, [
      "node:pi5:metrics:system",
      "node:jelly:metrics:system",
    ]);

    const seen = [];
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === "data") seen.push(m.channel);
    });

    const payload = {
      cpu: { currentLoad: 10 },
      memory: { usedPercentage: 20 },
    };
    // Identical values on two nodes must both be delivered; they are
    // different machines, not a repeat of the same one.
    source.produce("node:pi5:metrics:system", payload);
    source.produce("node:jelly:metrics:system", payload);
    await settle();

    expect(seen).toContain("node:pi5:metrics:system");
    expect(seen).toContain("node:jelly:metrics:system");
    ws.close();
  });

  it("resends after a resubscribe rather than suppressing as unchanged", async () => {
    const ws = await connect();
    await nextMessage(ws, (m) => m.type === "connected");

    const payload = {
      cpu: { currentLoad: 10 },
      memory: { usedPercentage: 20 },
    };

    await subscribe(ws, ["node:pi5:metrics:system"]);
    source.produce("node:pi5:metrics:system", payload);
    await nextMessage(ws, (m) => m.type === "data");

    ws.send(
      JSON.stringify({
        type: "unsubscribe",
        channels: ["node:pi5:metrics:system"],
      })
    );
    await nextMessage(ws, (m) => m.type === "unsubscribed");

    await subscribe(ws, ["node:pi5:metrics:system"]);
    const data = nextMessage(ws, (m) => m.type === "data");
    source.produce("node:pi5:metrics:system", payload);

    expect((await data).data.cpu.currentLoad).toBe(10);
    ws.close();
  });
});

describe("stats", () => {
  it("reports connected clients and active channels", async () => {
    const ws = await connect();
    await nextMessage(ws, (m) => m.type === "connected");
    await subscribe(ws, ["node:pi5:metrics:system", "fleet"]);
    await settle();

    const stats = manager.getStats();
    expect(stats.connectedClients).toBe(1);
    expect(stats.activeChannels).toBe(2);
    expect(stats.channelSubscribers["fleet"]).toBe(1);
    ws.close();
  });
});

describe("auth", () => {
  it("closes a socket that fails verification", async () => {
    manager.verifyToken = () => false;

    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const code = await new Promise((resolve) => {
      ws.on("close", resolve);
      ws.on("error", () => {});
    });

    expect(code).toBe(4401);
  });
});
