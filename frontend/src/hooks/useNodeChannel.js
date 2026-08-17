import { useState, useEffect, useCallback, useRef } from "react";
import { useWebSocket } from "./useWebSocket";
import { fetchNodeChannel } from "../api/api";
import { nodeChannel } from "../constants/channels";

/**
 * One panel's data for one node, over either transport.
 *
 * Each panel owns its own subscription, so a collapsed or unwatched panel
 * causes no work anywhere in the fleet.
 *
 * Data is deliberately *not* cleared when the selected node changes. Blanking
 * every panel on each switch made the dashboard flash; instead the previous
 * reading is kept and tagged with the node it came from, so the UI can show it
 * dimmed and clearly labelled while the new node's first sample arrives.
 *
 * @param {string|null} nodeId
 * @param {string|null} channel - node-local channel, e.g. "metrics:network"
 * @param {object} options
 * @param {"websocket"|"polling"} options.mode
 * @param {boolean} options.enabled - false while a panel is collapsed
 * @param {number} options.interval - polling period in ms
 */
export function useNodeChannel(
  nodeId,
  channel,
  { mode = "polling", enabled = true, interval = 5000 } = {}
) {
  const { isConnected, subscribe } = useWebSocket();
  const [state, setState] = useState({
    data: null,
    // Which node the retained data actually describes.
    dataNodeId: null,
    lastUpdate: null,
  });
  const [error, setError] = useState(null);

  const live = mode === "websocket" && isConnected;
  const activeRef = useRef(true);

  const receive = useCallback((data, forNodeId, timestamp) => {
    setState({
      data,
      dataNodeId: forNodeId,
      lastUpdate: timestamp ?? Date.now(),
    });
    setError(null);
  }, []);

  const load = useCallback(async () => {
    if (!nodeId || !channel) return;
    try {
      const result = await fetchNodeChannel(nodeId, channel);
      if (!activeRef.current) return;
      receive(result, nodeId);
    } catch (err) {
      if (activeRef.current) setError(err.message);
    }
  }, [nodeId, channel, receive]);

  useEffect(() => {
    activeRef.current = true;
    if (!enabled || !nodeId || !channel) return undefined;

    // A new target means any existing error belonged to the old one.
    setError(null);

    if (live) {
      const unsubscribe = subscribe(
        nodeChannel(nodeId, channel),
        (payload, timestamp) => {
          if (!activeRef.current) return;
          receive(payload, nodeId, timestamp);
        }
      );
      return () => {
        activeRef.current = false;
        unsubscribe();
      };
    }

    load();
    const timer = setInterval(load, interval);
    return () => {
      activeRef.current = false;
      clearInterval(timer);
    };
  }, [live, enabled, nodeId, channel, interval, subscribe, load, receive]);

  // True while showing another node's reading during a switch.
  const isForeign =
    state.data !== null && state.dataNodeId !== null && state.dataNodeId !== nodeId;

  return {
    data: state.data,
    lastUpdate: state.lastUpdate,
    error,
    isForeign,
    isLive: live,
    refetch: load,
  };
}

export default useNodeChannel;
