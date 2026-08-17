import { memo, useMemo } from "react";
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
 * Each panel holds its own subscription so one panel's update does not
 * re-render the others, and reports its own connection state so an
 * unreachable node is visibly unreachable rather than permanently "loading".
 */
const NodePanel = memo(function NodePanel({
  panelId,
  nodeId,
  nodeName,
  nodeStatus,
  isCollapsed,
  onCollapseChange,
  dataMode,
  onModeChange,
  hiddenPartitions,
  onHiddenPartitionsChange,
}) {
  const Panel = PANEL_COMPONENTS[panelId];
  const channel = PANEL_TO_CHANNEL[panelId];

  const { data, error, lastUpdate, isForeign, isLive, refetch } = useNodeChannel(
    nodeId,
    channel,
    {
      mode: dataMode,
      enabled: !isCollapsed,
      interval: DEFAULT_POLLING_INTERVALS[panelId] ?? 5000,
    }
  );

  const connection = useMemo(() => {
    // The node being down is a better explanation than any request error, so
    // it takes precedence in what the panel tells the user.
    let status;
    if (nodeStatus === "offline" || nodeStatus === "disabled") {
      status = "offline";
    } else if (error) {
      status = "error";
    } else if (isForeign) {
      status = "switching";
    } else if (data === null) {
      status = "loading";
    } else {
      status = "live";
    }

    return { status, lastUpdate, error, nodeName, onRetry: refetch };
  }, [nodeStatus, error, isForeign, data, lastUpdate, nodeName, refetch]);

  const shared = {
    isCollapsed,
    onCollapseChange,
    panelId,
    dataMode,
    onModeChange,
    wsConnected: isLive,
    connection,
  };

  return (
    <ErrorBoundary panelName={PANEL_LABELS[panelId]}>
      {panelId === "docker" ? (
        <DockerPanel
          {...shared}
          nodeId={nodeId}
          containers={data}
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
