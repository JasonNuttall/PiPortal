/**
 * Data source for a node running in agent role.
 *
 * Presents the same interface the hub's NodeManager does, so one WebSocket
 * server implementation serves both roles. Channels here are unprefixed
 * (`metrics:system`); the hub adds the `node:<id>:` namespace when it
 * rebroadcasts what it receives.
 */
const { EventEmitter } = require("events");
const collectors = require("../collectors");
const { LocalNodeClient } = require("../nodes/NodeClient");

class AgentSource extends EventEmitter {
  constructor(node) {
    super();
    this.client = new LocalNodeClient({ ...node, isLocal: true });
    this.lastValues = new Map();

    this.client.on("data", (channel, data, timestamp) => {
      this.lastValues.set(channel, { data, timestamp });
      this.emit("data", channel, data, timestamp);
    });
  }

  start() {
    this.client.start();
  }

  stop() {
    this.client.stop();
  }

  getAvailableChannels() {
    return [...collectors.CHANNEL_NAMES];
  }

  isValidChannel(channel) {
    return collectors.isValidChannel(channel);
  }

  peek(channel) {
    return this.lastValues.get(channel);
  }

  setDemand(channels) {
    this.client.setDesiredChannels(channels);
  }

  fetch(channel) {
    return this.client.fetch(channel);
  }
}

module.exports = AgentSource;
