import { memo, useState, useCallback, useMemo } from "react";
import { Boxes, ExternalLink } from "lucide-react";
import BasePanel from "../BasePanel";
import ErrorBoundary from "../ErrorBoundary";
import DatasetSection from "./DatasetSection";
import DetailSheet from "./DetailSheet";
import { useModuleData } from "../../hooks/useModuleData";

/**
 * A registered module, rendered as an ordinary panel.
 *
 * Nothing below this component knows a module is different from CPU or disk —
 * it reports the same connection states and lives in the same grid.
 */
const ModulePanel = memo(function ModulePanel({
  module,
  isCollapsed,
  onCollapseChange,
  size,
  onCycleSize,
}) {
  const [selected, setSelected] = useState(null);
  // A window belongs to the module payload rather than one dataset, so the
  // panel collects whatever its datasets ask for.
  const [windows, setWindows] = useState({});

  const handleWindowChange = useCallback((datasetId, window) => {
    setWindows((prev) => {
      if (prev[datasetId] === window) return prev;
      if (!window && !(datasetId in prev)) return prev;
      const next = { ...prev };
      if (window) next[datasetId] = window;
      else delete next[datasetId];
      return next;
    });
  }, []);

  // Only one dataset can be paging at a time in practice; take the widest ask.
  const window = useMemo(() => {
    const asks = Object.values(windows).filter(Boolean);
    if (asks.length === 0) return undefined;
    return {
      from: asks.map((a) => a.from).sort()[0],
      to: asks.map((a) => a.to).sort().at(-1),
    };
  }, [windows]);

  const { data, error, lastUpdate, isLive } = useModuleData(module.id, {
    enabled: !isCollapsed,
    window,
  });

  const connection = {
    status: error ? "error" : data === null ? "loading" : "live",
    lastUpdate,
    error,
    nodeName: module.name,
  };

  const href = data?.href ?? module.url;

  const headerActions = href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open ${module.name}`}
      className="p-1 rounded-sm text-ctext-dim hover:text-crystal-blue transition-colors"
    >
      <ExternalLink className="w-3.5 h-3.5" />
    </a>
  ) : null;

  return (
    <ErrorBoundary panelName={module.name}>
      <BasePanel
        title={data?.title ?? module.name}
        icon={Boxes}
        iconColor="text-crystal-teal"
        data={data?.datasets ?? null}
        isCollapsed={isCollapsed}
        onCollapseChange={onCollapseChange}
        headerActions={headerActions}
        panelId={`module:${module.id}`}
        wsConnected={isLive}
        connection={connection}
        size={size}
        onCycleSize={onCycleSize}
      >
        {(datasets) =>
          datasets.length === 0 ? (
            <p className="text-[10px] text-ctext-mid text-center py-3">
              This module reports no data.
            </p>
          ) : (
            <div className="divide-y divide-glass-border">
              {datasets.map((dataset) => (
                <DatasetSection
                  key={dataset.id}
                  moduleId={module.id}
                  dataset={dataset}
                  onSelectItem={setSelected}
                  onWindowChange={handleWindowChange}
                />
              ))}
            </div>
          )
        }
      </BasePanel>

      {selected && (
        <DetailSheet
          moduleId={module.id}
          item={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </ErrorBoundary>
  );
});

export default ModulePanel;
