import { useState, useEffect, useRef, useCallback } from "react";

// WebSocket URL - uses same host as current page, port 3001
const getWebSocketUrl = () => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  // In production, use same hostname but port 3001
  // In development with Vite proxy, this still works
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  return `${protocol}//${host}:3001`;
};

// Singleton WebSocket connection manager
let globalWs = null;
let globalSubscribers = new Map(); // channel -> Set<callback>
let globalConnectionCallbacks = new Set(); // Set<{onConnect, onDisconnect}>
let reconnectTimeout = null;
let reconnectAttempts = 0;
let isConnecting = false;

const MAX_RECONNECT_DELAY = 30000;
const INITIAL_RECONNECT_DELAY = 1000;

/**
 * Connect to WebSocket server
 */
const connect = () => {
  if (globalWs?.readyState === WebSocket.OPEN || isConnecting) {
    return;
  }

  isConnecting = true;
  const wsUrl = getWebSocketUrl();

  try {
    globalWs = new WebSocket(wsUrl);

    globalWs.onopen = () => {
      console.log("WebSocket connected");
      isConnecting = false;
      reconnectAttempts = 0;

      // Notify all connection listeners
      globalConnectionCallbacks.forEach(({ onConnect }) => {
        onConnect?.();
      });

      // Re-subscribe to all channels
      const channels = Array.from(globalSubscribers.keys());
      if (channels.length > 0) {
        globalWs.send(JSON.stringify({ type: "subscribe", channels }));
      }
    };

    globalWs.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === "data" && message.channel) {
          // Dispatch to channel subscribers
          const callbacks = globalSubscribers.get(message.channel);
          callbacks?.forEach((cb) => cb(message.data, message.timestamp));
        }
      } catch (err) {
        console.error("WebSocket message parse error:", err);
      }
    };

    globalWs.onclose = () => {
      console.log("WebSocket disconnected");
      isConnecting = false;
      globalWs = null;

      // Notify all connection listeners
      globalConnectionCallbacks.forEach(({ onDisconnect }) => {
        onDisconnect?.();
      });

      // Schedule reconnection
      scheduleReconnect();
    };

    globalWs.onerror = (err) => {
      console.error("WebSocket error:", err);
      isConnecting = false;
    };
  } catch (err) {
    console.error("WebSocket connection failed:", err);
    isConnecting = false;
    scheduleReconnect();
  }
};

/**
 * Schedule a reconnection with exponential backoff
 */
const scheduleReconnect = () => {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  const delay = Math.min(
    INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
    MAX_RECONNECT_DELAY
  );

  reconnectAttempts++;
  console.log(`WebSocket reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);

  reconnectTimeout = setTimeout(connect, delay);
};

/**
 * Subscribe to a channel
 * @param {string} channel - Channel name
 * @param {Function} callback - Callback function (data, timestamp) => void
 * @returns {Function} Unsubscribe function
 */
const subscribe = (channel, callback) => {
  if (!globalSubscribers.has(channel)) {
    globalSubscribers.set(channel, new Set());

    // Send subscribe message if connected
    if (globalWs?.readyState === WebSocket.OPEN) {
      globalWs.send(JSON.stringify({ type: "subscribe", channels: [channel] }));
    }
  }

  globalSubscribers.get(channel).add(callback);

  // Return unsubscribe function
  return () => {
    const callbacks = globalSubscribers.get(channel);
    callbacks?.delete(callback);

    // If no more subscribers for this channel, unsubscribe from server
    if (callbacks?.size === 0) {
      globalSubscribers.delete(channel);

      if (globalWs?.readyState === WebSocket.OPEN) {
        globalWs.send(
          JSON.stringify({ type: "unsubscribe", channels: [channel] })
        );
      }
    }
  };
};

/**
 * Check if WebSocket is connected
 */
const isConnected = () => globalWs?.readyState === WebSocket.OPEN;

/**
 * React hook for WebSocket connection
 * Manages connection lifecycle and provides subscribe function
 */
export function useWebSocket() {
  const [connected, setConnected] = useState(isConnected());
  const callbackRef = useRef({ onConnect: null, onDisconnect: null });

  useEffect(() => {
    // Setup connection callbacks
    callbackRef.current = {
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
    };

    globalConnectionCallbacks.add(callbackRef.current);

    // Initial connection
    connect();

    // Set initial state
    setConnected(isConnected());

    return () => {
      globalConnectionCallbacks.delete(callbackRef.current);
    };
  }, []);

  const subscribeCallback = useCallback((channel, callback) => {
    return subscribe(channel, callback);
  }, []);

  return {
    isConnected: connected,
    subscribe: subscribeCallback,
  };
}

/**
 * React hook for subscribing to a specific channel
 * @param {string} channel - Channel name
 * @param {boolean} enabled - Whether to subscribe (for lazy loading)
 */
export function useWebSocketChannel(channel, enabled = true) {
  const [data, setData] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const { isConnected, subscribe } = useWebSocket();

  useEffect(() => {
    if (!enabled || !channel) {
      return;
    }

    const unsubscribe = subscribe(channel, (newData, timestamp) => {
      setData(newData);
      setLastUpdate(timestamp);
    });

    return unsubscribe;
  }, [channel, enabled, subscribe]);

  return {
    data,
    lastUpdate,
    isConnected,
  };
}

export default useWebSocket;
