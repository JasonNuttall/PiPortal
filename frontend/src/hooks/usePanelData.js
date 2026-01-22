import { useState, useEffect, useCallback, useRef } from "react";
import { useWebSocket } from "./useWebSocket";
import {
  fetchNetworkMetrics,
  fetchDetailedDiskInfo,
  fetchProcesses,
  fetchDockerContainers,
  fetchServices,
} from "../api/api";

/**
 * Mapping of WebSocket channels to REST fetch functions
 */
const CHANNEL_TO_FETCH = {
  "metrics:network": fetchNetworkMetrics,
  "metrics:disk:detailed": fetchDetailedDiskInfo,
  "metrics:processes": fetchProcesses,
  "docker:containers": fetchDockerContainers,
  services: fetchServices,
};

/**
 * Mapping of panel IDs to WebSocket channels
 */
export const PANEL_TO_CHANNEL = {
  network: "metrics:network",
  disk: "metrics:disk:detailed",
  processes: "metrics:processes",
  docker: "docker:containers",
  services: "services",
};

/**
 * Default polling intervals for each panel (ms)
 */
const DEFAULT_POLLING_INTERVALS = {
  network: 2000,
  disk: 10000,
  processes: 3000,
  docker: 5000,
  services: 30000,
};

/**
 * Hook for fetching panel data via either polling or WebSocket
 *
 * @param {string} panelId - Panel identifier (network, disk, processes, docker, services)
 * @param {Object} options
 * @param {string} options.mode - 'polling' or 'websocket'
 * @param {number} options.pollingInterval - Polling interval in ms (optional)
 * @param {boolean} options.enabled - Whether to fetch data (for lazy loading)
 */
export function usePanelData(
  panelId,
  { mode = "polling", pollingInterval, enabled = true } = {}
) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const { isConnected, subscribe } = useWebSocket();
  const pollingRef = useRef(null);
  const mountedRef = useRef(true);

  const channel = PANEL_TO_CHANNEL[panelId];
  const fetchFn = CHANNEL_TO_FETCH[channel];
  const interval = pollingInterval || DEFAULT_POLLING_INTERVALS[panelId] || 5000;

  // Polling fetch function
  const fetchData = useCallback(async () => {
    if (!fetchFn || !mountedRef.current) return;

    try {
      setIsLoading(true);
      const result = await fetchFn();
      if (mountedRef.current) {
        setData(result);
        setLastUpdate(Date.now());
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [fetchFn]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled || !channel) {
      return;
    }

    // Clean up previous polling interval
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (mode === "websocket" && isConnected) {
      // WebSocket mode
      const unsubscribe = subscribe(channel, (newData, timestamp) => {
        if (mountedRef.current) {
          setData(newData);
          setLastUpdate(timestamp || Date.now());
          setError(null);
        }
      });

      return () => {
        unsubscribe();
        mountedRef.current = false;
      };
    } else {
      // Polling mode (or WebSocket not connected)
      fetchData(); // Initial fetch

      pollingRef.current = setInterval(fetchData, interval);

      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        mountedRef.current = false;
      };
    }
  }, [mode, isConnected, channel, interval, enabled, subscribe, fetchData]);

  // Determine actual mode (websocket only if connected)
  const actualMode = mode === "websocket" && isConnected ? "websocket" : "polling";

  return {
    data,
    error,
    lastUpdate,
    isLoading,
    isWebSocket: actualMode === "websocket",
    wsConnected: isConnected,
    refetch: fetchData,
  };
}

export default usePanelData;
