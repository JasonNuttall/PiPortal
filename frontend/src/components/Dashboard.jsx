import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";

import Header from "./Header";
import MetricsPanel from "./MetricsPanel";
import FleetStrip from "./FleetStrip";
import NodesModal from "./NodesModal";
import NodePanel from "./NodePanel";
import LinksPanel from "./LinksPanel";
import ModulePanel from "./modules/ModulePanel";
import SortablePanel from "./SortablePanel";

import { useFleet } from "../hooks/useFleet";
import { useNodeShortcuts } from "../hooks/useNodeShortcuts";
import { useSelectedNode } from "../hooks/useSelectedNode";
import { usePanelState } from "../hooks/usePanelState";
import { usePanelLayout } from "../hooks/usePanelLayout";
import { BUILT_IN_PANELS, modulePanel, modulePanelId } from "../constants/panels";
import { useModules } from "../hooks/useModules";

const Dashboard = () => {
  const { nodes, error: fleetError, loaded, refresh } = useFleet();
  const { selectedId, selectedNode, selectNode } = useSelectedNode(nodes);
  const [managingNodes, setManagingNodes] = useState(false);

  // Disabled while the modal is open so typing an id does not switch nodes.
  useNodeShortcuts(nodes, selectedId, selectNode, !managingNodes);

  const {
    collapsedPanels,
    panelModes,
    hiddenPartitions,
    densePacking,
    toggleDensePacking,
    handleCollapseChange,
    handleModeChange,
    handleHiddenPartitionsChange,
  } = usePanelState();

  const { modules, loaded: modulesLoaded, refresh: refreshModules } = useModules();

  // A module scoped to a node only appears while that node is in focus.
  const visibleModules = useMemo(
    () =>
      modules.filter(
        (module) =>
          module.enabled && (!module.nodeId || module.nodeId === selectedId)
      ),
    [modules, selectedId]
  );

  const links = useMemo(
    () => visibleModules.filter((module) => module.kind === "link"),
    [visibleModules]
  );

  const nativeModules = useMemo(
    () => visibleModules.filter((module) => module.kind !== "link"),
    [visibleModules]
  );

  // Built-ins plus a panel per native module — the layout treats them alike.
  const panels = useMemo(
    () => [...BUILT_IN_PANELS, ...nativeModules.map(modulePanel)],
    [nativeModules]
  );
  const { layout, move, cycleSize } = usePanelLayout(selectedId, panels);

  const [isDragging, setIsDragging] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event) => {
      setIsDragging(false);
      const { active, over } = event;
      if (over && active.id !== over.id) {
        move(active.id, over.id);
      }
    },
    [move]
  );

  /**
   * Per-panel callbacks are memoised so each panel's props stay referentially
   * stable. Without this the inline arrow functions would change identity on
   * every render and defeat the memo on NodePanel.
   */
  const panelHandlers = useMemo(() => {
    const build = (panelId) => ({
      onCollapseChange: (collapsed) => handleCollapseChange(panelId, collapsed),
      onModeChange: (mode) => handleModeChange(panelId, mode),
    });
    return {
      network: build("network"),
      disk: build("disk"),
      processes: build("processes"),
      docker: build("docker"),
      services: build("services"),
    };
  }, [handleCollapseChange, handleModeChange]);

  const renderPanel = (panelId, size) => {
    const sizeProps = { size, onCycleSize: () => cycleSize(panelId) };

    if (panelId === "services") {
      return (
        <LinksPanel
          links={links}
          loaded={modulesLoaded}
          isCollapsed={collapsedPanels.services}
          onCollapseChange={panelHandlers.services.onCollapseChange}
          onManage={() => setManagingNodes(true)}
          {...sizeProps}
        />
      );
    }

    const module = nativeModules.find(
      (candidate) => modulePanelId(candidate.id) === panelId
    );
    if (module) {
      return (
        <ModulePanel
          module={module}
          isCollapsed={Boolean(collapsedPanels[panelId])}
          onCollapseChange={(collapsed) => handleCollapseChange(panelId, collapsed)}
          {...sizeProps}
        />
      );
    }

    return (
      <NodePanel
        panelId={panelId}
        {...sizeProps}
        nodeId={selectedId}
        nodeName={selectedNode?.name}
        nodeStatus={selectedNode?.status}
        isCollapsed={Boolean(collapsedPanels[panelId])}
        onCollapseChange={panelHandlers[panelId].onCollapseChange}
        dataMode={panelModes[panelId]}
        onModeChange={panelHandlers[panelId].onModeChange}
        hiddenPartitions={panelId === "disk" ? hiddenPartitions : undefined}
        onHiddenPartitionsChange={
          panelId === "disk" ? handleHiddenPartitionsChange : undefined
        }
      />
    );
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-ctext-mid">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div>
      <Header node={selectedNode} summary={selectedNode?.summary} />

      <main className="max-w-[2100px] mx-auto px-4 sm:px-8 py-6">
        {fleetError && (
          <div className="glass-card border-red-500/30 text-red-300 px-4 py-3 mb-6">
            Could not reach the hub: {fleetError}
          </div>
        )}

        <FleetStrip
          nodes={nodes}
          selectedId={selectedId}
          onSelect={selectNode}
          onManage={() => setManagingNodes(true)}
        />

        {selectedNode ? (
          <>
            <div className="flex items-center justify-between mb-3 gap-3">
              <h2 className="text-[9px] tracking-[4px] uppercase text-ctext-dim flex items-center gap-2">
                Viewing
                <span className="text-crystal-blue">{selectedNode.name}</span>
                {selectedNode.status !== "online" && (
                  <span className="glass-pill text-[8px] text-yellow-400 border-yellow-500/40 normal-case tracking-normal">
                    {selectedNode.status}
                    {selectedNode.error ? ` — ${selectedNode.error}` : ""}
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-3">
                {nodes.length > 1 && (
                  <span className="text-[8px] text-ctext-dim hidden lg:block">
                    press 1-9 or [ ] to switch nodes
                  </span>
                )}
                <button
                  type="button"
                  onClick={toggleDensePacking}
                  aria-pressed={densePacking}
                  title={
                    densePacking
                      ? "Panels fill gaps. Click to keep them in order."
                      : "Panels stay in order. Click to let them fill gaps."
                  }
                  className={`glass-pill text-[9px] transition-colors ${
                    densePacking
                      ? "text-crystal-blue border-crystal-blue/40"
                      : "text-ctext-mid hover:text-ctext"
                  }`}
                >
                  Compact layout
                </button>
              </div>
            </div>

            <MetricsPanel summary={selectedNode.summary} />

            <div className="mt-6 pl-0 md:pl-5">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={() => setIsDragging(true)}
                onDragCancel={() => setIsDragging(false)}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={layout.map((entry) => entry.id)}
                  strategy={rectSortingStrategy}
                >
                  <div
                    className="panel-grid"
                    data-dense={densePacking ? "true" : "false"}
                    data-dragging={isDragging ? "true" : "false"}
                  >
                    {layout.map((entry) => (
                      <SortablePanel
                        key={entry.id}
                        id={entry.id}
                        size={entry.size}
                        isCollapsed={Boolean(collapsedPanels[entry.id])}
                      >
                        {renderPanel(entry.id, entry.size)}
                      </SortablePanel>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </>
        ) : (
          <div className="glass-card p-6 text-center text-sm text-ctext-mid">
            Select a node to view its details.
          </div>
        )}
      </main>

      {managingNodes && (
        <NodesModal
          nodes={nodes}
          modules={modules}
          onClose={() => setManagingNodes(false)}
          onChanged={() => {
            refresh();
            refreshModules();
          }}
        />
      )}
    </div>
  );
};

export default Dashboard;
