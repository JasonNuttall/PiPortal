import { useState, useEffect, useCallback } from "react";
import { useWebSocket } from "./useWebSocket";
import { fetchModuleData } from "../api/api";

/**
 * One module's payload.
 *
 * Streams over `module:<id>` when the socket is up, and falls back to REST
 * otherwise. A window is only ever fetched over REST, since it is a question
 * about a specific range rather than a subscription.
 */
export function useModuleData(moduleId, { enabled = true, window: range } = {}) {
  const { isConnected, subscribe } = useWebSocket();
  const [state, setState] = useState({ data: null, lastUpdate: null });
  const [error, setError] = useState(null);

  const hasRange = Boolean(range?.from || range?.to);
  const live = isConnected && !hasRange;

  const load = useCallback(async () => {
    if (!moduleId) return;
    try {
      const payload = await fetchModuleData(moduleId, range ?? {});
      setState({ data: payload, lastUpdate: Date.now() });
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [moduleId, range?.from, range?.to]);

  useEffect(() => {
    if (!enabled || !moduleId) return undefined;

    if (live) {
      return subscribe(`module:${moduleId}`, (payload, timestamp) => {
        // The manager reports failures on the same channel.
        if (payload?.status === "error") {
          setError(payload.error ?? "Module unavailable");
          return;
        }
        setState({ data: payload, lastUpdate: timestamp ?? Date.now() });
        setError(null);
      });
    }

    load();
    return undefined;
  }, [live, enabled, moduleId, subscribe, load]);

  return { ...state, error, isLive: live, refetch: load };
}

export default useModuleData;
