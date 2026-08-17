import { useState, useEffect, useCallback, useRef } from "react";
import { useWebSocket } from "./useWebSocket";
import { fetchNodeChannel } from "../api/api";
import { nodeChannel } from "../constants/channels";

/**
 * One panel's data for one node, over either transport.
 *
 * Replaces the previous split between usePanelData (unused) and a central
 * loadData in Dashboard that re-fetched every panel on one shared timer. Each
 * panel now owns its own subscription, so a collapsed or unwatched panel
 * causes no work anywhere in the fleet.
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
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const live = mode === "websocket" && isConnected;
  const activeRef = useRef(true);

  // Switching node must not leave the previous machine's readings on screen.
  useEffect(() => {
    setData(null);
    setError(null);
    setLastUpdate(null);
  }, [nodeId, channel]);

  const load = useCallback(async () => {
    if (!nodeId || !channel) return;
    try {
      const result = await fetchNodeChannel(nodeId, channel);
      if (!activeRef.current) return;
      setData(result);
      setLastUpdate(Date.now());
      setError(null);
    } catch (err) {
      if (activeRef.current) setError(err.message);
    }
  }, [nodeId, channel]);

  useEffect(() => {
    activeRef.current = true;
    if (!enabled || !nodeId || !channel) return undefined;

    if (live) {
      const unsubscribe = subscribe(
        nodeChannel(nodeId, channel),
        (payload, timestamp) => {
          if (!activeRef.current) return;
          setData(payload);
          setLastUpdate(timestamp ?? Date.now());
          setError(null);
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
  }, [live, enabled, nodeId, channel, interval, subscribe, load]);

  return { data, error, lastUpdate, isLive: live, refetch: load };
}

export default useNodeChannel;
