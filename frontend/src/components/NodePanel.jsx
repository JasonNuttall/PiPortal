import { memo } from "react";
import NetworkPanel from "./NetworkPanel";
import DiskPanel from "./DiskPanel";
import ProcessPanel from "./ProcessPanel";
import DockerPanel from "./DockerPanel";
import ErrorBoundary from "./ErrorBoundary";
import { useNodeChannel } from "../hooks/useNodeChannel";
import {
  PANEL_TO_CHANNEL,
  DEFAULT_POLLING_INTERVALS,
} from "../constants/channels";

const PANEL_COMPONENTS = {
  network: NetworkPanel,
  disk: DiskPanel,
  processes: ProcessPanel,
  docker: DockerPanel,
};

const PANEL_LABELS = {
  network: "Network",
  disk: "Disk",
  processes: "Processes",
  docker: "Docker",
};

/**
 * Owns the data for exactly one panel on one node.
 *
 * Previously Dashboard held every panel's state and rebuilt all five elements
 * inside a single useMemo, so any one panel's update re-rendered all of them.
 * Giving each panel its own subscription means a process-list tick no longer
 * touches the disk or docker panels.
 */
const NodePanel = memo(function NodePanel({
  panelId,
  nodeId,
  isCollapsed,
  onCollapseChange,
  dataMode,
  onModeChange,
  hiddenPartitions,
  onHiddenPartitionsChange,
}) {
  const Panel = PANEL_COMPONENTS[panelId];
  const channel = PANEL_TO_CHANNEL[panelId];

  const { data, isLive, refetch } = useNodeChannel(nodeId, channel, {
    mode: dataMode,
    enabled: !isCollapsed,
    interval: DEFAULT_POLLING_INTERVALS[panelId] ?? 5000,
  });

  const shared = {
    isCollapsed,
    onCollapseChange,
    panelId,
    dataMode,
    onModeChange,
    wsConnected: isLive,
  };

  return (
    <ErrorBoundary panelName={PANEL_LABELS[panelId]}>
      {panelId === "docker" ? (
        <DockerPanel
          {...shared}
          nodeId={nodeId}
          containers={data ?? []}
          onUpdate={refetch}
        />
      ) : panelId === "disk" ? (
        <DiskPanel
          {...shared}
          data={data}
          hiddenPartitions={hiddenPartitions}
          onHiddenPartitionsChange={onHiddenPartitionsChange}
        />
      ) : (
        <Panel {...shared} data={data} />
      )}
    </ErrorBoundary>
  );
});

export default NodePanel;
