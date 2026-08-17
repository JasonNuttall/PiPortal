import { memo, useState, useEffect, useCallback } from "react";
import ServicesPanel from "./ServicesPanel";
import ErrorBoundary from "./ErrorBoundary";
import { fetchServices } from "../api/api";

/**
 * Service links for the node in focus, plus every fleet-wide link.
 *
 * These are edited by hand rather than sampled, so they are fetched once per
 * node change and re-fetched after a mutation instead of being streamed.
 */
const ServicesPanelContainer = memo(function ServicesPanelContainer({
  nodeId,
  isCollapsed,
  onCollapseChange,
}) {
  const [services, setServices] = useState([]);

  const load = useCallback(async () => {
    if (!nodeId) return;
    try {
      setServices(await fetchServices(nodeId));
    } catch {
      // The panel keeps whatever it last showed rather than blanking.
    }
  }, [nodeId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ErrorBoundary panelName="Services">
      <ServicesPanel
        services={services}
        onUpdate={load}
        nodeId={nodeId}
        isCollapsed={isCollapsed}
        onCollapseChange={onCollapseChange}
        panelId="services"
      />
    </ErrorBoundary>
  );
});

export default ServicesPanelContainer;
