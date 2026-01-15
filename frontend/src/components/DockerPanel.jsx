import { useState } from "react";
import { Container, Circle, ChevronDown, ChevronUp } from "lucide-react";

const DockerPanel = ({ containers }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

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
    <div className="bg-slate-800 rounded-lg border border-slate-700">
      <div
        className="p-6 border-b border-slate-700 cursor-pointer hover:bg-slate-700/50 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Container className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-bold text-slate-100">
              Docker Containers
            </h2>
            <span className="text-sm text-slate-400">
              ({containers.length})
            </span>
          </div>
          {isCollapsed ? (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-6">
          {containers.length === 0 ? (
            <p className="text-slate-400 text-center py-8">
              No containers found
            </p>
          ) : (
            <div className="space-y-3">
              {containers.map((container) => (
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
        </div>
      )}
    </div>
  );
};

export default DockerPanel;
