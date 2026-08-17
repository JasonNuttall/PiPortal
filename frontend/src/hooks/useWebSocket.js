import { useState, useEffect, useCallback, useSyncExternalStore } from "react";

/**
 * One WebSocket for the whole app, shared by every panel.
 *
 * The connection is addressed at the page's own origin under /ws, which nginx
 * proxies to the backend. The previous version hardcoded port 3001 on the
 * page's hostname, which broke behind TLS and any reverse proxy.
 *
 * Subscriptions are reference counted: the server is told to stop producing a
 * channel as soon as the last panel interested in it goes away, and everything
 * is released while the tab is hidden so a backgrounded dashboard costs the
 * fleet nothing.
 */
const getWebSocketUrl = () => {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
};

const MAX_RECONNECT_DELAY = 30000;
const INITIAL_RECONNECT_DELAY = 1000;

let socket = null;
let connecting = false;
let reconnectTimer = null;
let reconnectAttempts = 0;
let paused = false;

/** channel -> Set<callback> */
const subscribers = new Map();
/** Latest payload per channel, so a late subscriber renders immediately. */
const lastValues = new Map();
/** Listeners for connection-state changes. */
const statusListeners = new Set();

const isOpen = () => socket?.readyState === WebSocket.OPEN;

const notifyStatus = () => {
  for (const listener of statusListeners) listener();
};

const send = (message) => {
  if (isOpen()) {
    socket.send(JSON.stringify(message));
    return true;
  }
  return false;
};

const activeChannels = () => [...subscribers.keys()];

const connect = () => {
  if (paused || isOpen() || connecting) return;

  connecting = true;
  let next;
  try {
    next = new WebSocket(getWebSocketUrl());
  } catch {
    connecting = false;
    scheduleReconnect();
    return;
  }
  socket = next;

  next.onopen = () => {
    connecting = false;
    reconnectAttempts = 0;
    notifyStatus();

    const channels = activeChannels();
    if (channels.length > 0) {
      send({ type: "subscribe", channels });
    }
  };

  next.onmessage = (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.type !== "data" || !message.channel) return;

    lastValues.set(message.channel, message.data);
    const callbacks = subscribers.get(message.channel);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(message.data, message.timestamp);
      }
    }
  };

  next.onclose = () => {
    connecting = false;
    socket = null;
    notifyStatus();
    scheduleReconnect();
  };

  next.onerror = () => {
    // onclose always follows, which is where reconnection is handled.
    connecting = false;
  };
};

const scheduleReconnect = () => {
  if (paused || reconnectTimer) return;

  const delay = Math.min(
    INITIAL_RECONNECT_DELAY * 2 ** reconnectAttempts,
    MAX_RECONNECT_DELAY
  );
  reconnectAttempts++;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
};

/**
 * Subscribe to a channel.
 * @returns {() => void} unsubscribe
 */
const subscribe = (channel, callback) => {
  let callbacks = subscribers.get(channel);

  if (!callbacks) {
    callbacks = new Set();
    subscribers.set(channel, callbacks);
    send({ type: "subscribe", channels: [channel] });
  }
  callbacks.add(callback);

  // Replay the last known value so a panel opening mid-stream is not blank.
  const cached = lastValues.get(channel);
  if (cached !== undefined) callback(cached, Date.now());

  return () => {
    const current = subscribers.get(channel);
    if (!current) return;
    current.delete(callback);

    if (current.size === 0) {
      subscribers.delete(channel);
      lastValues.delete(channel);
      send({ type: "unsubscribe", channels: [channel] });
    }
  };
};

/**
 * Release every subscription while the tab is hidden, so the hub and its
 * agents stop collecting for a dashboard nobody is looking at.
 */
const handleVisibilityChange = () => {
  if (document.visibilityState === "hidden") {
    paused = true;
    const channels = activeChannels();
    if (channels.length > 0) send({ type: "unsubscribe", channels });
    socket?.close();
    socket = null;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    notifyStatus();
  } else {
    paused = false;
    reconnectAttempts = 0;
    connect();
  }
};

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

const subscribeToStatus = (listener) => {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
};

export function useWebSocket() {
  const connected = useSyncExternalStore(
    subscribeToStatus,
    isOpen,
    () => false
  );

  useEffect(() => {
    connect();
  }, []);

  const subscribeCallback = useCallback(
    (channel, callback) => subscribe(channel, callback),
    []
  );

  return { isConnected: connected, subscribe: subscribeCallback };
}

/**
 * Subscribe to one channel and expose its latest payload.
 * @param {string|null} channel - null disables the subscription
 * @param {boolean} enabled - false disables it too (used for collapsed panels)
 */
export function useWebSocketChannel(channel, enabled = true) {
  const { isConnected, subscribe: subscribeTo } = useWebSocket();
  const [state, setState] = useState({ data: null, lastUpdate: null });

  useEffect(() => {
    if (!enabled || !channel) {
      setState({ data: null, lastUpdate: null });
      return undefined;
    }
    return subscribeTo(channel, (data, timestamp) => {
      setState({ data, lastUpdate: timestamp ?? Date.now() });
    });
  }, [channel, enabled, subscribeTo]);

  return { ...state, isConnected };
}

export default useWebSocket;
