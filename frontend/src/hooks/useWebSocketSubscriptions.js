import { useEffect, useRef } from "react";
import { PANEL_TO_CHANNEL } from "./usePanelData";

/**
 * Hook for managing WebSocket subscriptions based on panel modes and collapsed state.
 * Handles network speed calculation for the MetricsPanel.
 */
export function useWebSocketSubscriptions({
  wsConnected,
  subscribe,
  panelModes,
  collapsedPanels,
  setNetworkData,
  setDetailedDiskData,
  setDockerContainers,
  setServices,
  setProcessData,
  setNetworkStats,
}) {
  const previousNetworkDataRef = useRef(null);
  const previousNetworkTimeRef = useRef(null);

  useEffect(() => {
    if (!wsConnected) return;

    const unsubscribers = [];

    const panelConfig = {
      network: {
        setter: setNetworkData,
        transform: (data) => {
          if (
            previousNetworkDataRef.current &&
            previousNetworkTimeRef.current
          ) {
            const currentTime = Date.now();
            const timeDiff =
              (currentTime - previousNetworkTimeRef.current) / 1000;
            const currentStats = data.stats?.[0];
            const prevStats = previousNetworkDataRef.current.stats?.[0];

            if (currentStats && prevStats && timeDiff > 0) {
              const rxDiff = Math.max(
                0,
                currentStats.rx_bytes - prevStats.rx_bytes,
              );
              const txDiff = Math.max(
                0,
                currentStats.tx_bytes - prevStats.tx_bytes,
              );
              setNetworkStats({
                downloadSpeed: rxDiff / timeDiff,
                uploadSpeed: txDiff / timeDiff,
              });
            }
          }
          previousNetworkDataRef.current = data;
          previousNetworkTimeRef.current = Date.now();
          return data;
        },
      },
      disk: { setter: setDetailedDiskData },
      docker: { setter: setDockerContainers },
      services: { setter: setServices },
      processes: { setter: setProcessData },
    };

    Object.entries(panelModes).forEach(([panelId, mode]) => {
      if (mode === "websocket" && !collapsedPanels[panelId]) {
        const channel = PANEL_TO_CHANNEL[panelId];
        const config = panelConfig[panelId];

        if (channel && config) {
          const unsubscribe = subscribe(channel, (data) => {
            if (config.transform) {
              config.setter(config.transform(data));
            } else {
              config.setter(data);
            }
          });
          unsubscribers.push(unsubscribe);
        }
      }
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [
    wsConnected,
    panelModes,
    collapsedPanels,
    subscribe,
    setNetworkData,
    setDetailedDiskData,
    setDockerContainers,
    setServices,
    setProcessData,
    setNetworkStats,
  ]);

  return { previousNetworkDataRef, previousNetworkTimeRef };
}

export default useWebSocketSubscriptions;
