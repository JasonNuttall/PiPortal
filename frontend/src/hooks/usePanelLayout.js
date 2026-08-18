import { useState, useEffect, useCallback, useMemo } from "react";
import { PANEL_SIZES, nextSize } from "../constants/panels";

const LEGACY_KEY = "panelOrder";
const layoutKey = (nodeId) => `panelLayout:${nodeId ?? "default"}`;

/**
 * Fold the old two-column layout into a single ordered list.
 *
 * Reading order down two columns is left[0], right[0], left[1], … so
 * interleaving preserves roughly what the user was looking at, where
 * concatenating would silently reshuffle their arrangement.
 */
export const migrateLegacyOrder = (legacy) => {
  if (!legacy || !Array.isArray(legacy.left) || !Array.isArray(legacy.right)) {
    return null;
  }
  const merged = [];
  const longest = Math.max(legacy.left.length, legacy.right.length);
  for (let i = 0; i < longest; i++) {
    if (legacy.left[i]) merged.push(legacy.left[i]);
    if (legacy.right[i]) merged.push(legacy.right[i]);
  }
  return merged.map((id) => ({ id }));
};

/**
 * Bring a saved layout in line with the panels that currently exist.
 * Unknown ids are dropped and new ones appended, so registering or removing a
 * module never leaves a hole or throws.
 */
export const reconcileLayout = (saved, panels) => {
  const byId = new Map(panels.map((panel) => [panel.id, panel]));
  const seen = new Set();

  // One pass, because filtering and mapping separately would leave `seen`
  // empty during the filter and let duplicates through.
  const kept = [];
  for (const entry of saved ?? []) {
    if (!entry || !byId.has(entry.id) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    const panel = byId.get(entry.id);
    kept.push({
      id: entry.id,
      size: PANEL_SIZES.includes(entry.size) ? entry.size : panel.defaultSize,
    });
  }

  const added = panels
    .filter((panel) => !seen.has(panel.id))
    .map((panel) => ({ id: panel.id, size: panel.defaultSize }));

  return [...kept, ...added];
};

const readLayout = (nodeId) => {
  try {
    const saved = localStorage.getItem(layoutKey(nodeId));
    if (saved) return JSON.parse(saved);

    // First run on this node: inherit the pre-multi-node arrangement.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) return migrateLegacyOrder(JSON.parse(legacy));
  } catch {
    // A corrupt entry should reset the layout, not break the dashboard.
  }
  return null;
};

/**
 * Panel arrangement for one node: a single ordered list of { id, size }.
 *
 * @param {string|null} nodeId - layouts are remembered per machine, because
 *   different machines run different modules
 * @param {Array<{id: string, defaultSize: string}>} panels
 */
export function usePanelLayout(nodeId, panels) {
  const [layouts, setLayouts] = useState({});
  const key = nodeId ?? "default";

  // Load a node's saved layout once, rather than re-reading storage on every
  // render — which would also hand a fresh array to memoised panels each time.
  useEffect(() => {
    setLayouts((prev) =>
      key in prev ? prev : { ...prev, [key]: readLayout(nodeId) }
    );
  }, [key, nodeId]);

  const layout = useMemo(
    () => reconcileLayout(layouts[key], panels),
    [layouts, key, panels]
  );

  const persist = useCallback(
    (next) => {
      setLayouts((prev) => ({ ...prev, [key]: next }));
      try {
        localStorage.setItem(layoutKey(nodeId), JSON.stringify(next));
      } catch {
        // Private browsing and full quotas should not break dragging.
      }
    },
    [key, nodeId]
  );

  const move = useCallback(
    (activeId, overId) => {
      const from = layout.findIndex((entry) => entry.id === activeId);
      const to = layout.findIndex((entry) => entry.id === overId);
      if (from === -1 || to === -1 || from === to) return;

      const next = [...layout];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      persist(next);
    },
    [layout, persist]
  );

  const cycleSize = useCallback(
    (panelId) => {
      persist(
        layout.map((entry) =>
          entry.id === panelId ? { ...entry, size: nextSize(entry.size) } : entry
        )
      );
    },
    [layout, persist]
  );

  const setSize = useCallback(
    (panelId, size) => {
      if (!PANEL_SIZES.includes(size)) return;
      persist(
        layout.map((entry) => (entry.id === panelId ? { ...entry, size } : entry))
      );
    },
    [layout, persist]
  );

  return { layout, move, cycleSize, setSize };
}

export default usePanelLayout;
