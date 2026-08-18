/**
 * The hub's data source: nodes and modules behind one interface.
 *
 * The WebSocket server does not need to know that `node:*` and `module:*`
 * come from different managers, so routing lives here rather than leaking
 * into the transport.
 */
const { EventEmitter } = require("events");

class HubSource extends EventEmitter {
  constructor(nodeManager, moduleManager) {
    super();
    this.nodes = nodeManager;
    this.modules = moduleManager;

    // Both managers emit the same event shape; forward without translation.
    this.forward = (channel, data, timestamp) =>
      this.emit("data", channel, data, timestamp);
  }

  start() {
    this.nodes.on("data", this.forward);
    this.modules.on("data", this.forward);
    this.nodes.start();
    this.modules.start();
  }

  stop() {
    this.nodes.off("data", this.forward);
    this.modules.off("data", this.forward);
    this.nodes.stop();
    this.modules.stop();
  }

  /** Which manager owns a channel. */
  managerFor(channel) {
    return channel.startsWith("module:") || channel === "modules"
      ? this.modules
      : this.nodes;
  }

  getAvailableChannels() {
    return [
      ...this.nodes.getAvailableChannels(),
      ...this.modules.getAvailableChannels(),
    ];
  }

  isValidChannel(channel) {
    return this.managerFor(channel).isValidChannel(channel);
  }

  peek(channel) {
    return this.managerFor(channel).peek(channel);
  }

  /** Demand is split so each manager only hears about its own channels. */
  setDemand(channels) {
    const all = [...channels];
    this.nodes.setDemand(all.filter((c) => !c.startsWith("module:") && c !== "modules"));
    this.modules.setDemand(all.filter((c) => c.startsWith("module:")));
  }

  fetch(channel, options) {
    return this.managerFor(channel).fetch(channel, options);
  }
}

module.exports = HubSource;
