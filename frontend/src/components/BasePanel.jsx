import { useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

const BasePanel = ({
  title,
  icon: Icon,
  children,
  data = null,
  collapsible = true,
  isCollapsed: controlledCollapsed,
  onCollapseChange,
  headerActions = null,
  iconColor = "text-blue-400",
  subtitle = null,
  panelId = null,
  dataMode = "polling",
  onModeChange = null,
  wsConnected = false,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed =
    controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;

  const handleCollapseToggle = () => {
    const newState = !isCollapsed;
    if (onCollapseChange) {
      onCollapseChange(newState);
    } else {
      setInternalCollapsed(newState);
    }
  };

  const subtitleValue =
    typeof subtitle === "function" ? subtitle(data) : subtitle;

  const ModeToggle = () => {
    if (!panelId || !onModeChange) return null;

    const isWebSocket = dataMode === "websocket";
    const isLive = isWebSocket && wsConnected;

    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onModeChange(isWebSocket ? "polling" : "websocket");
        }}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-sm text-xs font-medium transition-all border ${
          isWebSocket
            ? isLive
              ? "bg-crystal-blue/15 text-crystal-blue border-crystal-blue/40 hover:bg-crystal-blue/25"
              : "bg-yellow-500/15 text-yellow-400 border-yellow-500/40 hover:bg-yellow-500/25"
            : "bg-glass text-ctext-mid border-glass-border hover:bg-glass-hover hover:text-ctext"
        }`}
        title={
          isWebSocket
            ? isLive
              ? "Real-time mode (WebSocket connected) - Click for polling"
              : "Connecting to WebSocket... - Click for polling"
            : "Polling mode - Click for real-time"
        }
      >
        {isWebSocket ? (
          <>
            <span
              className={`w-2 h-2 rounded-full ${
                isLive
                  ? "bg-crystal-blue animate-pulse-glow"
                  : "bg-yellow-400 animate-pulse"
              }`}
            />
            <span>Live</span>
          </>
        ) : (
          <>
            <RefreshCw className="w-3 h-3" />
            <span>Poll</span>
          </>
        )}
      </button>
    );
  };

  return (
    <div className="glass-card glass-card-accent-blue glass-refraction">
      {/* Panel Header */}
      <div
        className={`px-4 py-3 flex items-center justify-between ${
          collapsible
            ? "cursor-pointer hover:bg-glass-hover transition-colors"
            : ""
        } border-b border-glass-border`}
        onClick={collapsible ? handleCollapseToggle : undefined}
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${iconColor} mr-1`} />
          <h2 className="font-spectral italic font-medium text-base text-ctext tracking-wide">
            {title}
          </h2>
          {subtitleValue && (
            <span className="text-xs text-ctext-mid">{subtitleValue}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <ModeToggle />

          {headerActions && !isCollapsed && (
            <div onClick={(e) => e.stopPropagation()}>{headerActions}</div>
          )}

          {collapsible && (
            <button className="text-ctext-dim hover:text-ctext transition-colors">
              {isCollapsed ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronUp className="w-5 h-5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Panel Content */}
      {!isCollapsed && (
        <div className="p-4">
          {data === null ? (
            <div className="text-ctext-mid text-center text-xs tracking-widest uppercase">
              Loading...
            </div>
          ) : typeof children === "function" ? (
            children(data)
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
};

export default BasePanel;
