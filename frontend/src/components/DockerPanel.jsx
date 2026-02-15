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
        return "text-green-400";
      case "exited":
        return "text-red-400";
      case "paused":
        return "text-yellow-400";
      default:
        return "text-slate-400";
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
      iconColor="text-blue-400"
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
            <p className="text-slate-400 text-center py-8">
              No containers found
            </p>
          ) : (
            <div className="space-y-3">
              {data.map((container) => {
                const loading = !!actionLoading[container.id];
                const actions = getAvailableActions(container.state);

                return (
                  <div
                    key={container.id}
                    className="bg-slate-700/50 rounded-lg p-4 hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Circle
                            className={`w-3 h-3 fill-current ${getStatusColor(
                              container.state
                            )}`}
                          />
                          <h3 className="font-semibold text-slate-100">
                            {container.name}
                          </h3>
                        </div>
                        <p className="text-sm text-slate-400">
                          {container.image}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {container.status}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          {loading ? (
                            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
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
                                  className={`p-1.5 rounded ${config.color} ${config.bgHover} transition-colors`}
                                  title={config.label}
                                >
                                  <Icon className="w-4 h-4" />
                                </button>
                              );
                            })
                          )}
                        </div>
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            container.state === "running"
                              ? "bg-green-900/50 text-green-300"
                              : "bg-red-900/50 text-red-300"
                          }`}
                        >
                          {container.state}
                        </span>
                      </div>
                    </div>
                    {container.ports && container.ports.length > 0 && (
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {container.ports
                          .filter((p) => p.public)
                          .map((port, idx) => (
                            <span
                              key={idx}
                              className="text-xs bg-slate-600 px-2 py-1 rounded"
                            >
                              {port.public}→{port.private}
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
