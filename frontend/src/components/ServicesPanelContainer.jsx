import { memo, useState, useEffect, useCallback } from "react";
import ServicesPanel from "./ServicesPanel";
import ErrorBoundary from "./ErrorBoundary";
import { fetchServices } from "../api/api";

/**
 * Service links for the node in focus, plus every fleet-wide link.
 *
 * These are edited by hand rather than sampled, so they are fetched on node
 * change and after a mutation instead of being streamed.
 */
const ServicesPanelContainer = memo(function ServicesPanelContainer({
  nodeId,
  isCollapsed,
  onCollapseChange,
}) {
  const [services, setServices] = useState(null);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const load = useCallback(async () => {
    if (!nodeId) return;
    try {
      setServices(await fetchServices(nodeId));
      setLastUpdate(Date.now());
      setError(null);
    } catch (err) {
      // Previously swallowed, which made a failed load look like an empty
      // list. The panel keeps what it had and says the refresh failed.
      setError(err.message);
    }
  }, [nodeId]);

  useEffect(() => {
    load();
  }, [load]);

  const connection = {
    status: error ? "error" : services === null ? "loading" : "live",
    lastUpdate,
    error,
    onRetry: load,
  };

  return (
    <ErrorBoundary panelName="Services">
      <ServicesPanel
        services={services}
        onUpdate={load}
        nodeId={nodeId}
        isCollapsed={isCollapsed}
        onCollapseChange={onCollapseChange}
        panelId="services"
        connection={connection}
      />
    </ErrorBoundary>
  );
});

export default ServicesPanelContainer;
