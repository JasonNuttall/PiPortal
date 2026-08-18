import { useState, useEffect, useCallback } from "react";
import { useWebSocket } from "./useWebSocket";
import { fetchModules } from "../api/api";

const MODULES_CHANNEL = "modules";

/** The module registry, kept current over the `modules` channel. */
export function useModules() {
  const { isConnected, subscribe } = useWebSocket();
  const [modules, setModules] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setModules(await fetchModules());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isConnected) return undefined;
    return subscribe(MODULES_CHANNEL, (data) => {
      if (Array.isArray(data)) setModules(data);
    });
  }, [isConnected, subscribe]);

  return { modules, loaded, error, refresh: load };
}

export default useModules;
