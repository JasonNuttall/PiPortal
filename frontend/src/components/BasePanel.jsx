import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertTriangle,
  WifiOff,
  Loader2,
  Minimize2,
  Maximize2,
  Square,
} from "lucide-react";
import { useRelativeTime } from "../hooks/useRelativeTime";

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
  /**
   * How this panel's data is doing.
   * status: "live" | "loading" | "switching" | "offline" | "error"
   */
  connection = null,
  /** Current grid width, and a callback to cycle it. */
  size = null,
  onCycleSize = null,
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

  const status = connection?.status ?? (data === null ? "loading" : "live");
  const hasData = data !== null && data !== undefined;
  const isSwitching = status === "switching";
  const problem = status === "offline" || status === "error";

  // Ages are only rendered when something is wrong, so the timer that keeps
  // them fresh only runs then.
  const age = useRelativeTime(connection?.lastUpdate, problem || isSwitching);

  const ProblemIcon = status === "offline" ? WifiOff : AlertTriangle;
  const problemText =
    status === "offline"
      ? `${connection?.nodeName ?? "This node"} is unreachable`
      : connection?.error || "Could not load this panel";

  const SIZE_META = {
    compact: { icon: Minimize2, label: "Compact", next: "wide" },
    wide: { icon: Square, label: "Wide", next: "full" },
    full: { icon: Maximize2, label: "Full width", next: "compact" },
  };

  const SizeControl = () => {
    if (!size || !onCycleSize) return null;
    const meta = SIZE_META[size] ?? SIZE_META.compact;
    const Icon = meta.icon;

    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onCycleSize();
        }}
        aria-label={`Panel width: ${meta.label}. Click for ${SIZE_META[meta.next].label.toLowerCase()}`}
        title={`${meta.label} — click for ${SIZE_META[meta.next].label.toLowerCase()}`}
        className="p-1 rounded-sm text-ctext-dim hover:text-ctext hover:bg-glass-hover transition-colors"
      >
        <Icon className="w-3.5 h-3.5" />
      </button>
    );
  };

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
          <SizeControl />
          {isSwitching && (
            <span
              className="flex items-center gap-1 text-[9px] text-ctext-dim"
              title={`Loading ${connection?.nodeName ?? "node"}`}
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              {connection?.nodeName}
            </span>
          )}
          {problem && hasData && (
            <span
              className="flex items-center gap-1 text-[9px] text-yellow-400"
              title={problemText}
            >
              <ProblemIcon className="w-3 h-3" />
              {age ?? "stale"}
            </span>
          )}

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
          {problem && !hasData ? (
            // Nothing to show and something is wrong: say so, rather than
            // leaving a spinner that never resolves.
            <div className="text-center py-6">
              <ProblemIcon className="w-5 h-5 mx-auto mb-2 text-yellow-400" />
              <p className="text-xs text-ctext-mid">{problemText}</p>
              {age && <p className="text-[9px] text-ctext-dim mt-1">Last update {age}</p>}
              {connection?.onRetry && (
                <button
                  type="button"
                  onClick={connection.onRetry}
                  className="glass-pill text-[10px] text-ctext-mid hover:text-ctext transition-colors mt-3"
                >
                  Retry
                </button>
              )}
            </div>
          ) : !hasData ? (
            <div className="text-ctext-mid text-center text-xs tracking-widest uppercase">
              Loading...
            </div>
          ) : (
            <div
              // Data that is not current is shown faded so it cannot be
              // mistaken for a live reading.
              className={
                problem || isSwitching
                  ? "opacity-40 transition-opacity"
                  : "transition-opacity"
              }
            >
              {typeof children === "function" ? children(data) : children}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BasePanel;
