import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "selectedNodeId";

/**
 * Which node the detail panels are showing.
 *
 * The choice is remembered across reloads, but falls back to the first
 * available node if the remembered one has since been removed or disabled.
 */
export function useSelectedNode(nodes) {
  const [selectedId, setSelectedId] = useState(
    () => localStorage.getItem(STORAGE_KEY) || null
  );

  useEffect(() => {
    if (nodes.length === 0) return;

    const stillExists = nodes.some((node) => node.id === selectedId);
    if (stillExists) return;

    // Prefer the hub's own machine when the remembered choice is gone.
    const fallback = nodes.find((node) => node.isLocal) ?? nodes[0];
    setSelectedId(fallback.id);
    localStorage.setItem(STORAGE_KEY, fallback.id);
  }, [nodes, selectedId]);

  const selectNode = useCallback((id) => {
    setSelectedId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const selectedNode = nodes.find((node) => node.id === selectedId) ?? null;

  return { selectedId, selectedNode, selectNode };
}

export default useSelectedNode;
