import { useState, useCallback } from "react";

const key = (moduleId, datasetId) => `moduleView:${moduleId}:${datasetId}`;

/**
 * Which view a dataset is drawn with.
 *
 * The module may suggest one, but a choice made here wins and persists — a
 * service changing its mind should not rearrange someone's dashboard.
 */
export function useViewPreference(moduleId, dataset) {
  const stored = (() => {
    try {
      return localStorage.getItem(key(moduleId, dataset?.id));
    } catch {
      return null;
    }
  })();

  const legal = dataset?.views ?? [];
  const fallback = dataset?.suggests ?? legal[0] ?? null;

  const [chosen, setChosen] = useState(
    stored && legal.includes(stored) ? stored : null
  );

  const view = chosen ?? fallback;

  const selectView = useCallback(
    (next) => {
      if (!legal.includes(next)) return;
      setChosen(next);
      try {
        localStorage.setItem(key(moduleId, dataset?.id), next);
      } catch {
        // A full quota should not stop the view changing for this session.
      }
    },
    [legal, moduleId, dataset?.id]
  );

  return { view, views: legal, selectView };
}

export default useViewPreference;
