import { useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

/**
 * Base Panel Component
 * Provides consistent structure and functionality for all dashboard panels
 *
 * @param {string} title - Panel title
 * @param {React.Component} icon - Lucide icon component
 * @param {React.ReactNode} children - Panel content (function receiving data, or direct JSX)
 * @param {any} data - Data passed as prop from parent (centralized fetching)
 * @param {boolean} collapsible - Whether panel can be collapsed (default: true)
 * @param {boolean} isCollapsed - Controlled collapse state from parent
 * @param {function} onCollapseChange - Callback when collapse state changes
 * @param {React.ReactNode} headerActions - Optional actions to render in header (e.g., buttons)
 * @param {string} iconColor - Tailwind color class for icon (default: "text-blue-400")
 * @param {string|function} subtitle - Optional subtitle (e.g., count badge) or function receiving data
 * @param {string} panelId - Unique panel identifier (for mode toggle)
 * @param {string} dataMode - Data fetching mode: 'polling' or 'websocket'
 * @param {function} onModeChange - Callback when data mode changes
 * @param {boolean} wsConnected - Whether WebSocket is connected
 */
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
  // Use controlled state if provided, otherwise use internal state
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;

  // Handle collapse toggle
  const handleCollapseToggle = () => {
    const newState = !isCollapsed;
    if (onCollapseChange) {
      onCollapseChange(newState);
    } else {
      setInternalCollapsed(newState);
    }
  };

  // Compute subtitle value (can be string or function)
  const subtitleValue =
    typeof subtitle === "function" ? subtitle(data) : subtitle;

  // Mode toggle button component
  const ModeToggle = () => {
    if (!panelId || !onModeChange) return null;

    const isWebSocket = dataMode === "websocket";
    const isLive = isWebSocket && wsConnected;
    const isConnecting = isWebSocket && !wsConnected;

    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onModeChange(isWebSocket ? "polling" : "websocket");
        }}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-all ${
          isWebSocket
            ? isLive
              ? "bg-green-500/20 text-green-400 border border-green-500/50 hover:bg-green-500/30"
              : "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 hover:bg-yellow-500/30"
            : "bg-slate-600/50 text-slate-400 border border-slate-500/50 hover:bg-slate-600 hover:text-slate-300"
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
                isLive ? "bg-green-400" : "bg-yellow-400 animate-pulse"
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
    <div className="bg-slate-800 rounded-lg border border-slate-700">
      {/* Panel Header */}
      <div
        className={`p-4 flex items-center justify-between ${
          collapsible
            ? "cursor-pointer hover:bg-slate-700/30 transition-colors"
            : ""
        } border-b border-slate-700`}
        onClick={collapsible ? handleCollapseToggle : undefined}
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-6 h-6 ${iconColor} mr-1`} />
          <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
          {subtitleValue && (
            <span className="text-sm text-slate-400">{subtitleValue}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Mode toggle (Poll/Live) */}
          <ModeToggle />

          {/* Custom header actions (e.g., Add Service button) */}
          {headerActions && !isCollapsed && (
            <div onClick={(e) => e.stopPropagation()}>{headerActions}</div>
          )}

          {/* Collapse toggle */}
          {collapsible && (
            <button className="text-slate-400 hover:text-slate-200 transition-colors">
              {isCollapsed ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronUp className="w-5 h-5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Panel Content - only render when expanded */}
      {!isCollapsed && (
        <div className="p-6">
          {data === null ? (
            <div className="text-slate-400 text-center">Loading...</div>
          ) : (
            typeof children === "function" ? children(data) : children
          )}
        </div>
      )}
    </div>
  );
};

export default BasePanel;
