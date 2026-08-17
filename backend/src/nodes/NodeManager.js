/**
 * Owns one NodeClient per registered node and routes data between them and
 * the browser-facing WebSocket server.
 *
 * Channel naming:
 *   agent/local side : "metrics:system"
 *   browser side     : "node:<nodeId>:metrics:system"
 *   plus "fleet"     : every enabled node's summary, for the overview strip
 *   plus "nodes"     : registry and reachability changes
 *
 * Demand flows downward. The WebSocket server reports which namespaced
 * channels its clients currently want; this class translates that into
 * per-node channel sets, so an idle node collects nothing at all.
 */
const { EventEmitter } = require("events");
const logger = require("../utils/logger");
const NodeModel = require("../db/NodeModel");
const collectors = require("../collectors");
const { createNodeClient, STATUS } = require("./NodeClient");

const FLEET_CHANNEL = "fleet";
const NODES_CHANNEL = "nodes";
const SUMMARY_CHANNEL = "summary";

/** "node:jelly:metrics:system" -> { nodeId: "jelly", channel: "metrics:system" } */
const parseNodeChannel = (channel) => {
  const match = /^node:([^:]+):(.+)$/.exec(channel);
  return match ? { nodeId: match[1], channel: match[2] } : null;
};

const nodeChannel = (nodeId, channel) => `node:${nodeId}:${channel}`;

class NodeManager extends EventEmitter {
  /**
   * @param {object} options
   * @param {number} [options.timeoutMs]
   * @param {Function} [options.createClient] - injectable for tests
   */
  constructor({ timeoutMs = 8000, createClient = createNodeClient } = {}) {
    super();
    this.createClient = createClient;
    /** @type {Map<string, import("./NodeClient").BaseNodeClient>} */
    this.clients = new Map();
    /** Last value per namespaced channel, so a new browser paints instantly. */
    this.lastValues = new Map();
    /** nodeId -> latest summary, for the fleet strip. */
    this.summaries = new Map();
    this.timeoutMs = timeoutMs;
    this.desired = new Set();
    this.fleetWanted = false;
    this.started = false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.reconcile();
  }

  stop() {
    this.started = false;
    for (const client of this.clients.values()) client.stop();
    this.clients.clear();
  }

  /**
   * Bring the live clients in line with the registry. Called at startup and
   * whenever a node is added, edited or removed.
   */
  reconcile() {
    const nodes = NodeModel.getAll();
    const seen = new Set();

    for (const node of nodes) {
      seen.add(node.id);
      const existing = this.clients.get(node.id);

      if (!node.enabled) {
        if (existing) this.removeClient(node.id);
        continue;
      }

      // A changed URL means the old socket points at the wrong machine.
      if (existing) {
        if (existing.node.url !== node.url) {
          this.removeClient(node.id);
        } else {
          existing.node = { ...existing.node, ...node };
          continue;
        }
      }

      this.addClient(node);
    }

    for (const id of [...this.clients.keys()]) {
      if (!seen.has(id)) this.removeClient(id);
    }

    this.applyDemand();
    this.emitNodes();
  }

  addClient(node) {
    const client = this.createClient(node, {
      token: node.isLocal ? null : NodeModel.getToken(node.id),
      timeoutMs: this.timeoutMs,
    });

    client.on("data", (channel, data, timestamp) => {
      const namespaced = nodeChannel(node.id, channel);
      this.lastValues.set(namespaced, { data, timestamp });

      this.emit("data", namespaced, data, timestamp);

      // A node summary changes the overview strip, which browsers subscribe
      // to as a single "fleet" channel rather than per node.
      if (channel === SUMMARY_CHANNEL) {
        this.summaries.set(node.id, { ...data, nodeId: node.id });
        this.emit("data", FLEET_CHANNEL, this.getFleet(), timestamp);
      }
    });

    client.on("status", () => this.emitNodes());

    this.clients.set(node.id, client);
    client.start();
    logger.info({ node: node.id, local: node.isLocal }, "Node client started");
  }

  removeClient(id) {
    const client = this.clients.get(id);
    if (!client) return;
    client.stop();
    client.removeAllListeners();
    this.clients.delete(id);
    this.summaries.delete(id);
    for (const key of this.lastValues.keys()) {
      if (key.startsWith(`node:${id}:`)) this.lastValues.delete(key);
    }
    logger.info({ node: id }, "Node client stopped");
  }

  /**
   * @param {Iterable<string>} channels - namespaced channels browsers want
   */
  setDemand(channels) {
    this.desired = new Set(channels);
    this.fleetWanted = this.desired.has(FLEET_CHANNEL);
    this.applyDemand();
  }

  applyDemand() {
    /** @type {Map<string, Set<string>>} */
    const perNode = new Map();
    for (const id of this.clients.keys()) perNode.set(id, new Set());

    for (const entry of this.desired) {
      const parsed = parseNodeChannel(entry);
      if (!parsed) continue;
      perNode.get(parsed.nodeId)?.add(parsed.channel);
    }

    // The overview needs a summary from every node at once.
    if (this.fleetWanted) {
      for (const set of perNode.values()) set.add(SUMMARY_CHANNEL);
    }

    for (const [id, channels] of perNode) {
      this.clients.get(id)?.setDesiredChannels(channels);
    }
  }

  /** Channels a client may subscribe to, given the current registry. */
  getAvailableChannels() {
    const channels = [FLEET_CHANNEL, NODES_CHANNEL];
    for (const id of this.clients.keys()) {
      for (const channel of collectors.CHANNEL_NAMES) {
        channels.push(nodeChannel(id, channel));
      }
    }
    return channels;
  }

  isValidChannel(channel) {
    if (channel === FLEET_CHANNEL || channel === NODES_CHANNEL) return true;
    const parsed = parseNodeChannel(channel);
    return Boolean(
      parsed &&
        this.clients.has(parsed.nodeId) &&
        collectors.isValidChannel(parsed.channel)
    );
  }

  /** Cached value for a namespaced channel, or undefined. */
  peek(channel) {
    if (channel === FLEET_CHANNEL) {
      return { data: this.getFleet(), timestamp: Date.now() };
    }
    if (channel === NODES_CHANNEL) {
      return { data: this.getNodes(), timestamp: Date.now() };
    }
    return this.lastValues.get(channel);
  }

  /** Collect a namespaced channel on demand (used by the REST proxy). */
  async fetch(channel) {
    const parsed = parseNodeChannel(channel);
    if (!parsed) throw new Error(`Unknown channel: ${channel}`);
    const client = this.clients.get(parsed.nodeId);
    if (!client) {
      const err = new Error(`Unknown node: ${parsed.nodeId}`);
      err.statusCode = 404;
      throw err;
    }
    return client.fetch(parsed.channel);
  }

  getClient(nodeId) {
    return this.clients.get(nodeId);
  }

  getNodes() {
    const registry = NodeModel.getAll();
    return registry.map((node) => {
      const client = this.clients.get(node.id);
      return client
        ? client.describe()
        : { ...node, status: node.enabled ? STATUS.OFFLINE : STATUS.DISABLED };
    });
  }

  /** Per-node summaries in registry order, for the overview strip. */
  getFleet() {
    return this.getNodes().map((node) => ({
      ...node,
      summary: this.summaries.get(node.id) ?? null,
    }));
  }

  /**
   * Like getFleet, but collects a summary for any node that has not reported
   * one yet. Collection is demand driven, so on a cold start nothing has been
   * sampled; without this the REST overview would be empty until a WebSocket
   * client subscribed, leaving the strip blank on first paint and permanently
   * blank wherever WebSockets are blocked.
   */
  async collectFleet() {
    const missing = [...this.clients.values()].filter(
      (client) => !this.summaries.has(client.id)
    );

    await Promise.all(
      missing.map(async (client) => {
        try {
          const summary = await client.fetch(SUMMARY_CHANNEL);
          this.summaries.set(client.id, { ...summary, nodeId: client.id });
        } catch {
          // An unreachable node keeps a null summary; the strip says so.
        }
      })
    );

    return this.getFleet();
  }

  emitNodes() {
    this.emit("data", NODES_CHANNEL, this.getNodes(), Date.now());
    this.emit("data", FLEET_CHANNEL, this.getFleet(), Date.now());
  }
}

module.exports = NodeManager;
module.exports.parseNodeChannel = parseNodeChannel;
module.exports.nodeChannel = nodeChannel;
module.exports.FLEET_CHANNEL = FLEET_CHANNEL;
module.exports.NODES_CHANNEL = NODES_CHANNEL;
