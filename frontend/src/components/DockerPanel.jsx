import { Container, Circle } from "lucide-react";
import BasePanel from "./BasePanel";

const DockerPanel = ({
  containers,
  isCollapsed,
  onCollapseChange,
  panelId,
  dataMode,
  onModeChange,
  wsConnected,
}) => {
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
              {data.map((container) => (
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
              ))}
            </div>
          )}
        </>
      )}
    </BasePanel>
  );
};

export default DockerPanel;
