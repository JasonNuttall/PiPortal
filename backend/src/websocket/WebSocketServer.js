/**
 * Browser-facing (and hub-facing) WebSocket server.
 *
 * Works against any data source exposing the NodeManager interface, so the
 * same class serves a hub (namespaced, multi-node channels) and an agent
 * (local channels consumed by a hub).
 *
 * Two changes matter for load:
 *
 *  - Collection is demand driven. Previously every channel ran a push loop
 *    from startup and each tick checked whether anyone was listening *after*
 *    doing the work. Now the union of client subscriptions is pushed down to
 *    the source, so an unsubscribed channel is never collected.
 *
 *  - Each outgoing payload is serialised once per channel and reused across
 *    subscribers, rather than per client.
 */
const WebSocket = require("ws");
const ChangeDetector = require("./ChangeDetector");
const logger = require("../utils/logger");
const collectors = require("../collectors");
const { baseChannel } = require("./ChangeDetector");

/** Clients that miss this many heartbeats are considered gone. */
const HEARTBEAT_INTERVAL_MS = 30000;

class WebSocketManager {
  /**
   * @param {import("http").Server} server
   * @param {object} source - NodeManager or AgentSource
   * @param {{verifyToken?: (req) => boolean}} options
   */
  constructor(server, source, { verifyToken = null } = {}) {
    this.wss = new WebSocket.Server({
      server,
      // Metric payloads are repetitive JSON and compress well. The threshold
      // keeps small control frames from paying for compression they don't need.
      perMessageDeflate: {
        threshold: 1024,
        zlibDeflateOptions: { level: 3 },
      },
    });
    this.source = source;
    this.verifyToken = verifyToken;
    this.clients = new Map(); // ws -> { id, subscriptions:Set, connectedAt, alive }
    /** channel -> number of subscribed clients */
    this.subscriberCounts = new Map();
    this.changeDetector = new ChangeDetector();
    this.heartbeatTimer = null;
    this.isRunning = false;

    this.onSourceData = this.onSourceData.bind(this);
    this.setupConnectionHandler();
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    this.source.on("data", this.onSourceData);
    this.source.start?.();

    this.heartbeatTimer = setInterval(() => this.checkHeartbeats(), HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref?.();

    logger.info("WebSocket: server ready");
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;

    this.source.off("data", this.onSourceData);
    this.source.stop?.();

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Data arriving from the source; forward it if it is worth forwarding. */
  onSourceData(channel, data, timestamp) {
    if ((this.subscriberCounts.get(channel) ?? 0) === 0) return;

    const spec = collectors.CHANNELS[baseChannel(channel)];
    const threshold = spec ? spec.threshold : null;

    if (!this.changeDetector.hasSignificantChange(channel, data, threshold)) {
      return;
    }

    this.broadcast(channel, data, timestamp);
  }

  setupConnectionHandler() {
    this.wss.on("connection", (ws, req) => {
      if (this.verifyToken && !this.verifyToken(req)) {
        ws.close(4401, "Unauthorized");
        return;
      }

      const clientId = this.generateClientId();
      this.clients.set(ws, {
        id: clientId,
        subscriptions: new Set(),
        connectedAt: Date.now(),
        alive: true,
      });

      logger.info({ clientId }, "WebSocket: client connected");

      this.send(ws, {
        type: "connected",
        clientId,
        channels: this.source.getAvailableChannels(),
      });

      ws.on("pong", () => {
        const client = this.clients.get(ws);
        if (client) client.alive = true;
      });

      ws.on("message", (raw) => this.handleMessage(ws, raw));

      ws.on("close", () => this.dropClient(ws));

      ws.on("error", (err) => {
        logger.error({ err }, "WebSocket: client error");
        this.dropClient(ws);
      });
    });

    this.wss.on("error", (err) => {
      logger.error({ err }, "WebSocket: server error");
    });
  }

  dropClient(ws) {
    const client = this.clients.get(ws);
    if (!client) return;
    for (const channel of client.subscriptions) {
      this.releaseChannel(channel);
    }
    this.clients.delete(ws);
    logger.info({ clientId: client.id }, "WebSocket: client disconnected");
    this.syncDemand();
  }

  /** Terminate sockets that stopped answering, so demand reflects reality. */
  checkHeartbeats() {
    for (const [ws, client] of this.clients) {
      if (!client.alive) {
        ws.terminate();
        this.dropClient(ws);
        continue;
      }
      client.alive = false;
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }
  }

  handleMessage(ws, raw) {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      this.send(ws, {
        type: "error",
        message: "Invalid JSON message",
        code: "INVALID_JSON",
      });
      return;
    }

    const client = this.clients.get(ws);
    if (!client) return;

    switch (message.type) {
      case "subscribe":
        this.handleSubscribe(ws, client, message.channels);
        break;
      case "unsubscribe":
        this.handleUnsubscribe(ws, client, message.channels);
        break;
      case "ping":
        this.send(ws, { type: "pong", timestamp: Date.now() });
        break;
      default:
        this.send(ws, {
          type: "error",
          message: `Unknown message type: ${message.type}`,
          code: "UNKNOWN_TYPE",
        });
    }
  }

  handleSubscribe(ws, client, channels) {
    if (!Array.isArray(channels)) {
      this.send(ws, {
        type: "error",
        message: "channels must be an array",
        code: "INVALID_CHANNELS",
      });
      return;
    }

    const valid = [];
    const invalid = [];

    for (const channel of channels) {
      if (!this.source.isValidChannel(channel)) {
        invalid.push(channel);
        continue;
      }
      if (!client.subscriptions.has(channel)) {
        client.subscriptions.add(channel);
        this.retainChannel(channel);
      }
      valid.push(channel);
    }

    this.send(ws, {
      type: "subscribed",
      channels: valid,
      invalid: invalid.length > 0 ? invalid : undefined,
    });

    this.syncDemand();

    // Paint immediately from cache where possible, so a newly opened panel is
    // not blank until the next collection tick.
    for (const channel of valid) {
      const cached = this.source.peek(channel);
      if (cached) {
        this.send(ws, {
          type: "data",
          channel,
          data: cached.data,
          timestamp: cached.timestamp,
        });
      }
    }
  }

  handleUnsubscribe(ws, client, channels) {
    if (!Array.isArray(channels)) {
      this.send(ws, {
        type: "error",
        message: "channels must be an array",
        code: "INVALID_CHANNELS",
      });
      return;
    }

    for (const channel of channels) {
      if (client.subscriptions.delete(channel)) {
        this.releaseChannel(channel);
      }
    }

    this.send(ws, { type: "unsubscribed", channels });
    this.syncDemand();
  }

  retainChannel(channel) {
    this.subscriberCounts.set(
      channel,
      (this.subscriberCounts.get(channel) ?? 0) + 1
    );
  }

  releaseChannel(channel) {
    const next = (this.subscriberCounts.get(channel) ?? 0) - 1;
    if (next <= 0) {
      this.subscriberCounts.delete(channel);
      // Stale comparison state would suppress the first push after a resubscribe.
      this.changeDetector.clear(channel);
    } else {
      this.subscriberCounts.set(channel, next);
    }
  }

  /** Tell the source exactly which channels still have listeners. */
  syncDemand() {
    this.source.setDemand([...this.subscriberCounts.keys()]);
  }

  broadcast(channel, data, timestamp = Date.now()) {
    // Serialise once for all subscribers rather than once per client.
    const message = JSON.stringify({
      type: "data",
      channel,
      data,
      timestamp,
    });

    for (const [ws, client] of this.clients) {
      if (client.subscriptions.has(channel) && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  getStats() {
    const channelSubscribers = {};
    for (const [channel, count] of this.subscriberCounts) {
      channelSubscribers[channel] = count;
    }
    return {
      connectedClients: this.clients.size,
      activeChannels: this.subscriberCounts.size,
      channelSubscribers,
      isRunning: this.isRunning,
    };
  }
}

module.exports = WebSocketManager;
