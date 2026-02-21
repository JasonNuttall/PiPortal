import { useState } from "react";
import {
  Container,
  Circle,
  Play,
  Square,
  RotateCw,
  Loader2,
} from "lucide-react";
import { containerAction } from "../api/api";
import BasePanel from "./BasePanel";

const getAvailableActions = (state) => {
  switch (state.toLowerCase()) {
    case "running":
      return ["stop", "restart"];
    case "exited":
    case "paused":
    case "created":
      return ["start"];
    default:
      return [];
  }
};

const ACTION_CONFIG = {
  start: {
    icon: Play,
    label: "Start",
    color: "text-green-400 hover:text-green-300",
    bgHover: "hover:bg-green-900/30",
  },
  stop: {
    icon: Square,
    label: "Stop",
    color: "text-red-400 hover:text-red-300",
    bgHover: "hover:bg-red-900/30",
  },
  restart: {
    icon: RotateCw,
    label: "Restart",
    color: "text-yellow-400 hover:text-yellow-300",
    bgHover: "hover:bg-yellow-900/30",
  },
};

const DockerPanel = ({
  containers,
  onUpdate,
  isCollapsed,
  onCollapseChange,
  panelId,
  dataMode,
  onModeChange,
  wsConnected,
}) => {
  const [actionLoading, setActionLoading] = useState({});

  const getStatusColor = (state) => {
    switch (state.toLowerCase()) {
      case "running":
        return "text-crystal-blue";
      case "exited":
        return "text-red-400";
      case "paused":
        return "text-yellow-400";
      default:
        return "text-ctext-dim";
    }
  };

  const handleAction = async (containerId, action) => {
    setActionLoading((prev) => ({ ...prev, [containerId]: action }));
    try {
      await containerAction(containerId, action);
      onUpdate();
    } catch (error) {
      console.error(`Failed to ${action} container ${containerId}:`, error);
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[containerId];
        return next;
      });
    }
  };

  return (
    <BasePanel
      title="Docker Containers"
      icon={Container}
      iconColor="text-crystal-blue"
      data={containers}
      isCollapsed={isCollapsed}
      onCollapseChange={onCollapseChange}
      subtitle={`(${containers?.length || 0})`}
      panelId={panelId}
      dataMode={dataMode}
      onModeChange={onModeChange}
      wsConnected={wsConnected}
    >
      {(data) => (
        <>
          {data.length === 0 ? (
            <p className="text-ctext-mid text-center py-8 text-xs">
              No containers found
            </p>
          ) : (
            <div className="space-y-2">
              {data.map((container) => {
                const loading = !!actionLoading[container.id];
                const actions = getAvailableActions(container.state);

                return (
                  <div
                    key={container.id}
                    className="bg-glass border border-glass-border rounded-sm p-3 hover:bg-glass-hover transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Circle
                            className={`w-2.5 h-2.5 fill-current ${getStatusColor(
                              container.state
                            )}`}
                            style={
                              container.state === "running"
                                ? { filter: "drop-shadow(0 0 4px rgba(56, 189, 248, 0.6))" }
                                : undefined
                            }
                          />
                          <h3 className="text-[10px] font-medium text-ctext">
                            {container.name}
                          </h3>
                        </div>
                        <p className="text-[8px] text-ctext-dim ml-[18px]">
                          {container.image}
                        </p>
                        <p className="text-[8px] text-ctext-dim ml-[18px] mt-0.5">
                          {container.status}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          {loading ? (
                            <Loader2 className="w-3.5 h-3.5 text-crystal-blue animate-spin" />
                          ) : (
                            actions.map((action) => {
                              const config = ACTION_CONFIG[action];
                              const Icon = config.icon;
                              return (
                                <button
                                  key={action}
                                  onClick={() =>
                                    handleAction(container.id, action)
                                  }
                                  className={`p-1 rounded-sm ${config.color} ${config.bgHover} transition-colors`}
                                  title={config.label}
                                >
                                  <Icon className="w-3.5 h-3.5" />
                                </button>
                              );
                            })
                          )}
                        </div>
                        <span
                          className={`glass-pill text-[8px] ${
                            container.state === "running"
                              ? "text-crystal-blue border-crystal-blue/30"
                              : "text-red-400 border-red-400/30"
                          }`}
                        >
                          {container.state}
                        </span>
                      </div>
                    </div>
                    {container.ports && container.ports.length > 0 && (
                      <div className="mt-2 ml-[18px] flex gap-1.5 flex-wrap">
                        {container.ports
                          .filter((p) => p.public)
                          .map((port, idx) => (
                            <span
                              key={idx}
                              className="glass-pill text-[8px] text-crystal-blue"
                            >
                              {port.public}&rarr;{port.private}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </BasePanel>
  );
};

export default DockerPanel;
