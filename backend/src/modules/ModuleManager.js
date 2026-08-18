/**
 * Owns one client per registered module and drives collection.
 *
 * Modules are channels like everything else — `module:<id>` — so they inherit
 * demand-driven collection, change detection, caching and the panel states the
 * dashboard already has. Nothing is fetched from a service nobody is looking
 * at.
 */
const { EventEmitter } = require("events");
const logger = require("../utils/logger");
const ModuleModel = require("../db/ModuleModel");
const ModuleClient = require("./ModuleClient");

const MODULES_CHANNEL = "modules";

/** "module:missedanep" -> "missedanep" */
const parseModuleChannel = (channel) => {
  const match = /^module:(.+)$/.exec(channel);
  return match ? match[1] : null;
};

const moduleChannel = (id) => `module:${id}`;

/** Back off a failing module rather than retrying it at full rate. */
const BACKOFF_MS = [0, 5000, 15000, 60000, 300000];

class ModuleManager extends EventEmitter {
  constructor({ timeoutMs = 8000, getNodeClient = null } = {}) {
    super();
    this.clients = new Map();
    this.timers = new Map();
    this.lastValues = new Map();
    this.failures = new Map();
    this.timeoutMs = timeoutMs;
    this.getNodeClient = getNodeClient;
    this.desired = new Set();
    this.started = false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.reconcile();
  }

  stop() {
    this.started = false;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.clients.clear();
  }

  reconcile() {
    const modules = ModuleModel.getAll();
    const seen = new Set();

    for (const module of modules) {
      seen.add(module.id);
      const existing = this.clients.get(module.id);

      if (!module.enabled) {
        if (existing) this.remove(module.id);
        continue;
      }

      // A changed target means the cached payload describes something else.
      const changed =
        existing &&
        (existing.module.url !== module.url ||
          existing.module.via !== module.via ||
          existing.module.kind !== module.kind);

      if (existing && !changed) {
        existing.module = { ...existing.module, ...module };
        continue;
      }
      if (existing) this.remove(module.id);

      this.clients.set(
        module.id,
        new ModuleClient(module, {
          token: ModuleModel.getToken(module.id),
          timeoutMs: this.timeoutMs,
          getNodeClient: this.getNodeClient,
        })
      );
    }

    for (const id of [...this.clients.keys()]) {
      if (!seen.has(id)) this.remove(id);
    }

    this.applyDemand();
    this.emit("data", MODULES_CHANNEL, this.getModules(), Date.now());
  }

  remove(id) {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    this.clients.delete(id);
    this.lastValues.delete(moduleChannel(id));
    this.failures.delete(id);
  }

  setDemand(channels) {
    this.desired = new Set(
      [...channels].map(parseModuleChannel).filter(Boolean)
    );
    this.applyDemand();
  }

  applyDemand() {
    for (const id of this.clients.keys()) {
      if (this.desired.has(id)) {
        if (!this.timers.has(id)) this.schedule(id, 0);
      } else if (this.timers.has(id)) {
        clearTimeout(this.timers.get(id));
        this.timers.delete(id);
      }
    }
  }

  schedule(id, delay) {
    const timer = setTimeout(() => this.collect(id), delay);
    timer.unref?.();
    this.timers.set(id, timer);
  }

  async collect(id) {
    const client = this.clients.get(id);
    if (!client || !this.desired.has(id)) {
      this.timers.delete(id);
      return;
    }

    let nextDelay;
    try {
      const payload = await client.fetch();
      this.failures.delete(id);
      this.lastValues.set(moduleChannel(id), {
        data: payload,
        timestamp: Date.now(),
      });
      this.emit("data", moduleChannel(id), payload, Date.now());
      // The module's own ttl decides how often it is worth asking again.
      nextDelay = payload.ttl * 1000;
    } catch (err) {
      const failures = (this.failures.get(id) ?? 0) + 1;
      this.failures.set(id, failures);
      logger.warn({ err, module: id, failures }, "Module collection failed");

      this.emit(
        "data",
        moduleChannel(id),
        { error: err.message, status: "error", id, datasets: [] },
        Date.now()
      );
      nextDelay = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)];
    }

    if (this.desired.has(id)) {
      this.schedule(id, nextDelay);
    } else {
      this.timers.delete(id);
    }
  }

  getAvailableChannels() {
    return [MODULES_CHANNEL, ...[...this.clients.keys()].map(moduleChannel)];
  }

  isValidChannel(channel) {
    if (channel === MODULES_CHANNEL) return true;
    const id = parseModuleChannel(channel);
    return Boolean(id && this.clients.has(id));
  }

  peek(channel) {
    if (channel === MODULES_CHANNEL) {
      return { data: this.getModules(), timestamp: Date.now() };
    }
    return this.lastValues.get(channel);
  }

  async fetch(channel, window) {
    const id = parseModuleChannel(channel);
    const client = this.clients.get(id);
    if (!client) {
      const err = new Error(`Unknown module: ${id}`);
      err.statusCode = 404;
      throw err;
    }
    return client.fetch(window);
  }

  getClient(id) {
    return this.clients.get(id);
  }

  getModules() {
    return ModuleModel.getAll().map((module) => ({
      ...module,
      failing: (this.failures.get(module.id) ?? 0) > 0,
    }));
  }
}

module.exports = ModuleManager;
module.exports.parseModuleChannel = parseModuleChannel;
module.exports.moduleChannel = moduleChannel;
module.exports.MODULES_CHANNEL = MODULES_CHANNEL;
