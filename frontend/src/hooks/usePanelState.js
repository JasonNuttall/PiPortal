import { useState, useCallback } from "react";

const defaultPanelOrder = {
  left: ["services", "network"],
  right: ["disk", "processes", "docker"],
};

/**
 * Hook for managing panel state: collapsed, modes, order, hidden partitions.
 * All state is persisted to localStorage.
 */
export function usePanelState() {
  const [collapsedPanels, setCollapsedPanels] = useState(() => {
    const saved = localStorage.getItem("collapsedPanels");
    return saved ? JSON.parse(saved) : {};
  });

  // Real time by default: the server now only collects what is subscribed and
  // only pushes what actually changed, so streaming costs less than polling.
  const [panelModes, setPanelModes] = useState(() => {
    const saved = localStorage.getItem("panelModes");
    const defaults = {
      network: "websocket",
      disk: "websocket",
      docker: "websocket",
      processes: "websocket",
    };
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  });

  const [hiddenPartitions, setHiddenPartitions] = useState(() => {
    const saved = localStorage.getItem("hiddenPartitions");
    return saved ? JSON.parse(saved) : [];
  });

  const [panelOrder, setPanelOrder] = useState(() => {
    const saved = localStorage.getItem("panelOrder");
    return saved ? JSON.parse(saved) : defaultPanelOrder;
  });

  const handleCollapseChange = useCallback((panelId, isCollapsed) => {
    setCollapsedPanels((prev) => {
      const newState = { ...prev, [panelId]: isCollapsed };
      localStorage.setItem("collapsedPanels", JSON.stringify(newState));
      return newState;
    });
  }, []);

  const handleModeChange = useCallback((panelId, mode) => {
    setPanelModes((prev) => {
      const newState = { ...prev, [panelId]: mode };
      localStorage.setItem("panelModes", JSON.stringify(newState));
      return newState;
    });
  }, []);

  const handleHiddenPartitionsChange = useCallback((partitions) => {
    setHiddenPartitions(partitions);
    localStorage.setItem("hiddenPartitions", JSON.stringify(partitions));
  }, []);

  return {
    collapsedPanels,
    panelModes,
    hiddenPartitions,
    panelOrder,
    setPanelOrder,
    handleCollapseChange,
    handleModeChange,
    handleHiddenPartitionsChange,
  };
}

export default usePanelState;
