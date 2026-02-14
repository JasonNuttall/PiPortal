/**
 * WebSocket Server Manager
 * Handles client connections, subscriptions, and data broadcasting
 */
const WebSocket = require("ws");
const ChangeDetector = require("./ChangeDetector");
const logger = require("../utils/logger");
const {
  CHANNEL_CONFIG,
  fetchChannelData,
  getChannelNames,
} = require("./channels");

class WebSocketManager {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.clients = new Map(); // ws -> { subscriptions: Set<channel> }
    this.changeDetector = new ChangeDetector();
    this.pushIntervals = new Map(); // channel -> intervalId
    this.isRunning = false;

    this.setupConnectionHandler();
  }

  /**
   * Start the data push loops for all channels
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info("WebSocket: Starting data push loops");

    Object.entries(CHANNEL_CONFIG).forEach(([channel, config]) => {
      const intervalId = setInterval(async () => {
        await this.pushChannelData(channel, config.threshold);
      }, config.interval);

      this.pushIntervals.set(channel, intervalId);
    });

    logger.info({ channels: Object.keys(CHANNEL_CONFIG).length }, "WebSocket: Push loops started");
  }

  /**
   * Stop all data push loops
   */
  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;

    logger.info("WebSocket: Stopping data push loops");

    this.pushIntervals.forEach((intervalId, channel) => {
      clearInterval(intervalId);
    });
    this.pushIntervals.clear();
  }

  /**
   * Setup WebSocket connection handler
   */
  setupConnectionHandler() {
    this.wss.on("connection", (ws, req) => {
      const clientId = this.generateClientId();
      this.clients.set(ws, {
        id: clientId,
        subscriptions: new Set(),
        connectedAt: Date.now(),
      });

      logger.info({ clientId }, "WebSocket: Client connected");

      // Send connection acknowledgment with available channels
      this.send(ws, {
        type: "connected",
        clientId,
        channels: getChannelNames(),
      });

      // Handle messages from client
      ws.on("message", (rawMessage) => {
        this.handleMessage(ws, rawMessage);
      });

      // Handle client disconnect
      ws.on("close", () => {
        const clientData = this.clients.get(ws);
        logger.info({ clientId: clientData?.id }, "WebSocket: Client disconnected");
        this.clients.delete(ws);
      });

      // Handle errors
      ws.on("error", (err) => {
        logger.error({ err }, "WebSocket: Client error");
        this.clients.delete(ws);
      });
    });

    this.wss.on("error", (err) => {
      logger.error({ err }, "WebSocket Server error");
    });
  }

  /**
   * Handle incoming message from client
   */
  handleMessage(ws, rawMessage) {
    try {
      const message = JSON.parse(rawMessage.toString());
      const clientData = this.clients.get(ws);

      if (!clientData) {
        logger.warn("WebSocket: Received message from unknown client");
        return;
      }

      switch (message.type) {
        case "subscribe":
          this.handleSubscribe(ws, clientData, message.channels);
          break;

        case "unsubscribe":
          this.handleUnsubscribe(ws, clientData, message.channels);
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
    } catch (err) {
      logger.error({ err }, "WebSocket: Failed to parse message");
      this.send(ws, {
        type: "error",
        message: "Invalid JSON message",
        code: "INVALID_JSON",
      });
    }
  }

  /**
   * Handle subscribe request
   */
  async handleSubscribe(ws, clientData, channels) {
    if (!Array.isArray(channels)) {
      this.send(ws, {
        type: "error",
        message: "channels must be an array",
        code: "INVALID_CHANNELS",
      });
      return;
    }

    const validChannels = [];
    const invalidChannels = [];

    channels.forEach((channel) => {
      if (CHANNEL_CONFIG[channel]) {
        clientData.subscriptions.add(channel);
        validChannels.push(channel);
      } else {
        invalidChannels.push(channel);
      }
    });

    // Send subscription confirmation
    this.send(ws, {
      type: "subscribed",
      channels: validChannels,
      invalid: invalidChannels.length > 0 ? invalidChannels : undefined,
    });

    logger.info({ clientId: clientData.id, channels: validChannels }, "WebSocket: Client subscribed");

    // Immediately send current data for subscribed channels
    for (const channel of validChannels) {
      try {
        const data = await fetchChannelData(channel);
        this.send(ws, {
          type: "data",
          channel,
          data,
          timestamp: Date.now(),
        });
      } catch (err) {
        logger.error({ err, channel }, "WebSocket: Failed to fetch initial data");
      }
    }
  }

  /**
   * Handle unsubscribe request
   */
  handleUnsubscribe(ws, clientData, channels) {
    if (!Array.isArray(channels)) {
      this.send(ws, {
        type: "error",
        message: "channels must be an array",
        code: "INVALID_CHANNELS",
      });
      return;
    }

    channels.forEach((channel) => {
      clientData.subscriptions.delete(channel);
    });

    this.send(ws, {
      type: "unsubscribed",
      channels,
    });

    logger.info({ clientId: clientData.id, channels }, "WebSocket: Client unsubscribed");
  }

  /**
   * Push data for a channel to all subscribed clients
   */
  async pushChannelData(channel, threshold) {
    // Check if any client is subscribed to this channel
    const hasSubscribers = Array.from(this.clients.values()).some((client) =>
      client.subscriptions.has(channel)
    );

    if (!hasSubscribers) {
      return; // Skip fetching if no one is listening
    }

    try {
      const data = await fetchChannelData(channel);

      // Check if change is significant
      if (!this.changeDetector.hasSignificantChange(channel, data, threshold)) {
        return; // Skip push if no significant change
      }

      // Broadcast to subscribed clients
      this.broadcast(channel, data);
    } catch (err) {
      logger.error({ err, channel }, "WebSocket: Failed to push channel data");
    }
  }

  /**
   * Broadcast data to all clients subscribed to a channel
   */
  broadcast(channel, data) {
    const message = JSON.stringify({
      type: "data",
      channel,
      data,
      timestamp: Date.now(),
    });

    let sentCount = 0;

    this.wss.clients.forEach((ws) => {
      const clientData = this.clients.get(ws);
      if (
        clientData?.subscriptions.has(channel) &&
        ws.readyState === WebSocket.OPEN
      ) {
        ws.send(message);
        sentCount++;
      }
    });

    if (sentCount > 0) {
      // Only log occasionally to reduce noise
      // console.log(`WebSocket: Broadcast ${channel} to ${sentCount} clients`);
    }
  }

  /**
   * Send message to a specific client
   */
  send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  /**
   * Generate a unique client ID
   */
  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current connection stats
   */
  getStats() {
    const channelSubscribers = {};
    getChannelNames().forEach((channel) => {
      channelSubscribers[channel] = 0;
    });

    this.clients.forEach((clientData) => {
      clientData.subscriptions.forEach((channel) => {
        channelSubscribers[channel]++;
      });
    });

    return {
      connectedClients: this.clients.size,
      channelSubscribers,
      isRunning: this.isRunning,
    };
  }
}

module.exports = WebSocketManager;
