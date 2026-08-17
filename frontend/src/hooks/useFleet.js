import { useState, useEffect, useCallback } from "react";
import { useWebSocket } from "./useWebSocket";
import { fetchFleet } from "../api/api";
import { FLEET_CHANNEL } from "../constants/channels";

const FLEET_POLL_INTERVAL = 5000;

/**
 * Every node's health line, for the overview strip.
 *
 * Streams over the `fleet` channel when the socket is up and falls back to
 * polling when it is not, so the strip keeps working even if WebSockets are
 * blocked between the browser and the hub.
 */
export function useFleet() {
  const { isConnected, subscribe } = useWebSocket();
  const [nodes, setNodes] = useState([]);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await fetchFleet();
      setNodes(result);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // Always fetch once so the node list exists before the socket settles.
    load();
  }, [load]);

  useEffect(() => {
    if (isConnected) {
      return subscribe(FLEET_CHANNEL, (data) => {
        if (Array.isArray(data)) {
          setNodes(data);
          setError(null);
          setLoaded(true);
        }
      });
    }

    const timer = setInterval(load, FLEET_POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [isConnected, subscribe, load]);

  return { nodes, error, loaded, refresh: load };
}

export default useFleet;
