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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";

import Header from "./Header";
import MetricsPanel from "./MetricsPanel";
import FleetStrip from "./FleetStrip";
import NodesModal from "./NodesModal";
import NodePanel from "./NodePanel";
import ServicesPanelContainer from "./ServicesPanelContainer";
import SortablePanel from "./SortablePanel";

import { useFleet } from "../hooks/useFleet";
import { useSelectedNode } from "../hooks/useSelectedNode";
import { usePanelState } from "../hooks/usePanelState";

const Dashboard = () => {
  const { nodes, error: fleetError, loaded, refresh } = useFleet();
  const { selectedId, selectedNode, selectNode } = useSelectedNode(nodes);
  const [managingNodes, setManagingNodes] = useState(false);

  const {
    collapsedPanels,
    panelModes,
    hiddenPartitions,
    panelOrder,
    setPanelOrder,
    handleCollapseChange,
    handleModeChange,
    handleHiddenPartitionsChange,
  } = usePanelState();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setPanelOrder((current) => {
        const activeColumn = current.left.includes(active.id) ? "left" : "right";
        const overColumn = current.left.includes(over.id) ? "left" : "right";

        let next;
        if (activeColumn === overColumn) {
          const items = [...current[activeColumn]];
          next = {
            ...current,
            [activeColumn]: arrayMove(
              items,
              items.indexOf(active.id),
              items.indexOf(over.id)
            ),
          };
        } else {
          const source = [...current[activeColumn]];
          const destination = [...current[overColumn]];
          source.splice(source.indexOf(active.id), 1);
          destination.splice(destination.indexOf(over.id), 0, active.id);
          next = {
            left: activeColumn === "left" ? source : destination,
            right: activeColumn === "right" ? source : destination,
          };
        }

        localStorage.setItem("panelOrder", JSON.stringify(next));
        return next;
      });
    },
    [setPanelOrder]
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

  const renderPanel = (panelId) => {
    if (panelId === "services") {
      return (
        <ServicesPanelContainer
          nodeId={selectedId}
          isCollapsed={collapsedPanels.services}
          onCollapseChange={panelHandlers.services.onCollapseChange}
        />
      );
    }

    return (
      <NodePanel
        panelId={panelId}
        nodeId={selectedId}
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

      <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-6">
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
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[9px] tracking-[4px] uppercase text-ctext-dim">
                Viewing{" "}
                <span className="text-crystal-blue">{selectedNode.name}</span>
              </h2>
            </div>

            <MetricsPanel summary={selectedNode.summary} />

            <div className="mt-6 pl-0 md:pl-6">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={[...panelOrder.left, ...panelOrder.right]}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    <div className="flex flex-col gap-6">
                      {panelOrder.left.map((panelId) => (
                        <SortablePanel key={panelId} id={panelId}>
                          {renderPanel(panelId)}
                        </SortablePanel>
                      ))}
                    </div>
                    <div className="flex flex-col gap-6">
                      {panelOrder.right.map((panelId) => (
                        <SortablePanel key={panelId} id={panelId}>
                          {renderPanel(panelId)}
                        </SortablePanel>
                      ))}
                    </div>
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
          onClose={() => setManagingNodes(false)}
          onChanged={refresh}
        />
      )}
    </div>
  );
};

export default Dashboard;
