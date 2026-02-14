import { useRef, useCallback } from "react";

/**
 * Hook for calculating network speed from sequential network data snapshots.
 * Returns a function that computes download/upload speeds from rx/tx byte diffs.
 */
export function useNetworkSpeed() {
  const previousNetworkDataRef = useRef(null);
  const previousNetworkTimeRef = useRef(null);

  const calculateSpeed = useCallback((data) => {
    let speeds = null;

    if (previousNetworkDataRef.current && previousNetworkTimeRef.current) {
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
        speeds = {
          downloadSpeed: rxDiff / timeDiff,
          uploadSpeed: txDiff / timeDiff,
        };
      }
    }

    previousNetworkDataRef.current = data;
    previousNetworkTimeRef.current = Date.now();

    return speeds;
  }, []);

  return { calculateSpeed, previousNetworkDataRef, previousNetworkTimeRef };
}

export default useNetworkSpeed;
