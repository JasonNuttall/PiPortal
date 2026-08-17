/**
 * A single node as seen by the hub.
 *
 * Two implementations behind one interface:
 *   LocalNodeClient  - the hub's own hardware, collected in-process.
 *   RemoteNodeClient - an agent reached over HTTP + WebSocket.
 *
 * Both are demand driven: nothing is collected for a channel until someone
 * subscribes to it, and collection stops when the last subscriber leaves. A
 * browser looking at one node therefore costs nothing on the others.
 */
const { EventEmitter } = require("events");
const WebSocket = require("ws");
const logger = require("../utils/logger");
const collectors = require("../collectors");

const STATUS = {
  ONLINE: "online",
  CONNECTING: "connecting",
  OFFLINE: "offline",
  DISABLED: "disabled",
};

class BaseNodeClient extends EventEmitter {
  constructor(node) {
    super();
    this.node = node;
    this.desired = new Set();
    this._status = STATUS.CONNECTING;
    this.lastSeen = null;
    this.lastError = null;
  }

  get id() {
    return this.node.id;
  }

  get status() {
    return this._status;
  }

  setStatus(status, error = null) {
    if (this._status === status && this.lastError === error) return;
    this._status = status;
    this.lastError = error;
    this.emit("status", this.describe());
  }

  describe() {
    return {
      id: this.node.id,
      name: this.node.name,
      url: this.node.url,
      isLocal: Boolean(this.node.isLocal),
      enabled: this.node.enabled !== false,
      status: this._status,
      lastSeen: this.lastSeen,
      error: this.lastError,
    };
  }

  emitData(channel, data, timestamp = Date.now()) {
    this.lastSeen = Date.now();
    this.emit("data", channel, data, timestamp);
  }

  /** Replace the set of channels this node should be producing. */
  setDesiredChannels(channels) {
    const next = new Set(channels);
    for (const channel of this.desired) {
      if (!next.has(channel)) this.onUnsubscribe(channel);
    }
    for (const channel of next) {
      if (!this.desired.has(channel)) this.onSubscribe(channel);
    }
    this.desired = next;
  }

  // Subclass hooks
  onSubscribe() {}
  onUnsubscribe() {}
  start() {}
  stop() {}
}

/**
 * The hub's own machine. Reads the collector registry directly — no socket,
 * no serialisation, no network hop.
 */
class LocalNodeClient extends BaseNodeClient {
  constructor(node) {
    super(node);
    this.timers = new Map();
    this._status = STATUS.ONLINE;
  }

  start() {
    this.setStatus(STATUS.ONLINE);
  }

  stop() {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
  }

  onSubscribe(channel) {
    if (this.timers.has(channel)) return;
    const spec = collectors.CHANNELS[channel];
    if (!spec) return;

    const tick = async () => {
      try {
        this.emitData(channel, await collectors.collect(channel));
      } catch (err) {
        logger.error({ err, channel }, "Local collection failed");
      }
    };

    tick();
    const timer = setInterval(tick, spec.interval);
    timer.unref?.();
    this.timers.set(channel, timer);
  }

  onUnsubscribe(channel) {
    const timer = this.timers.get(channel);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(channel);
    }
  }

  async fetch(channel) {
    return collectors.collect(channel);
  }

  /** Container actions on the hub's own Docker daemon. */
  async containerAction(id, action) {
    const docker = require("../collectors/docker");
    await docker.runContainerAction(id, action);
    return { success: true, action, containerId: id };
  }
}

const INITIAL_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30000;

/**
 * An agent on another machine.
 *
 * Prefers a persistent WebSocket, which lets the agent push only when its own
 * change detector says something moved. If the socket is unavailable it falls
 * back to REST polling at the channel's interval so a node with a blocked
 * WebSocket path still reports.
 */
class RemoteNodeClient extends BaseNodeClient {
  constructor(node, { token = null, timeoutMs = 8000 } = {}) {
    super(node);
    this.token = token;
    this.timeoutMs = timeoutMs;
    this.ws = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.pollTimers = new Map();
    this.running = false;
    this._status = STATUS.OFFLINE;
  }

  get httpBase() {
    return this.node.url.replace(/\/+$/, "");
  }

  get wsUrl() {
    return this.httpBase.replace(/^http/, "ws");
  }

  get headers() {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop() {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const timer of this.pollTimers.values()) clearInterval(timer);
    this.pollTimers.clear();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
  }

  connect() {
    if (!this.running || this.ws) return;
    this.setStatus(STATUS.CONNECTING);

    let socket;
    try {
      socket = new WebSocket(this.wsUrl, { headers: this.headers });
    } catch (err) {
      this.onDisconnected(err.message);
      return;
    }
    this.ws = socket;

    socket.on("open", () => {
      this.reconnectAttempts = 0;
      this.setStatus(STATUS.ONLINE);
      this.stopAllPolling();
      logger.info({ node: this.id }, "Agent connected");
      if (this.desired.size > 0) {
        this.send({ type: "subscribe", channels: [...this.desired] });
      }
    });

    socket.on("message", (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (message.type === "data" && message.channel) {
        this.emitData(message.channel, message.data, message.timestamp);
      }
    });

    socket.on("close", () => this.onDisconnected("connection closed"));
    socket.on("error", (err) => {
      // 'close' always follows 'error', so reconnection is handled there.
      logger.debug({ node: this.id, err: err.message }, "Agent socket error");
    });
  }

  onDisconnected(reason) {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws = null;
    }
    this.setStatus(STATUS.OFFLINE, reason);
    // Keep data flowing over REST while the socket is down.
    for (const channel of this.desired) this.startPolling(channel);
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (!this.running || this.reconnectTimer) return;
    const delay = Math.min(
      INITIAL_RECONNECT_MS * 2 ** this.reconnectAttempts,
      MAX_RECONNECT_MS
    );
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  send(message) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  onSubscribe(channel) {
    if (!this.send({ type: "subscribe", channels: [channel] })) {
      this.startPolling(channel);
    }
  }

  onUnsubscribe(channel) {
    this.send({ type: "unsubscribe", channels: [channel] });
    this.stopPolling(channel);
  }

  startPolling(channel) {
    if (this.pollTimers.has(channel)) return;
    const spec = collectors.CHANNELS[channel];
    if (!spec) return;

    const tick = async () => {
      try {
        this.emitData(channel, await this.fetch(channel));
        this.setStatus(this.ws ? this._status : STATUS.ONLINE);
      } catch (err) {
        this.setStatus(STATUS.OFFLINE, err.message);
      }
    };

    tick();
    const timer = setInterval(tick, spec.interval);
    timer.unref?.();
    this.pollTimers.set(channel, timer);
  }

  stopPolling(channel) {
    const timer = this.pollTimers.get(channel);
    if (timer) {
      clearInterval(timer);
      this.pollTimers.delete(channel);
    }
  }

  stopAllPolling() {
    for (const channel of this.pollTimers.keys()) this.stopPolling(channel);
  }

  async request(path, { method = "GET", body } = {}) {
    const response = await fetch(`${this.httpBase}${path}`, {
      method,
      headers: {
        ...this.headers,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const err = new Error(`Agent responded ${response.status}`);
      err.statusCode = response.status;
      throw err;
    }
    return response.status === 204 ? null : response.json();
  }

  /** Agents expose collectors at /api/local/<channel with : replaced by />. */
  async fetch(channel) {
    const data = await this.request(
      `/api/local/${channel.replace(/:/g, "/")}`
    );
    this.lastSeen = Date.now();
    return data;
  }

  async containerAction(id, action) {
    return this.request(`/api/local/docker/containers/${id}/${action}`, {
      method: "POST",
    });
  }
}

const createNodeClient = (node, options) =>
  node.isLocal
    ? new LocalNodeClient(node)
    : new RemoteNodeClient(node, options);

module.exports = {
  BaseNodeClient,
  LocalNodeClient,
  RemoteNodeClient,
  createNodeClient,
  STATUS,
};
