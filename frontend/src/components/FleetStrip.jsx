import { memo } from "react";
import { Cpu, MemoryStick, Thermometer, HardDrive, Server, Plus } from "lucide-react";

const STATUS_STYLES = {
  online: { dot: "bg-crystal-blue", label: "text-crystal-blue", glow: true },
  connecting: { dot: "bg-yellow-400 animate-pulse", label: "text-yellow-400" },
  offline: { dot: "bg-red-400", label: "text-red-400" },
  disabled: { dot: "bg-ctext-dim", label: "text-ctext-dim" },
};

const barClass = (percent) => {
  if (percent == null) return "crystal-bar-blue";
  if (percent < 50) return "crystal-bar-teal";
  if (percent < 75) return "crystal-bar-seafoam";
  if (percent < 90) return "crystal-bar-blue";
  return "crystal-bar-warn";
};

const formatUptime = (seconds) => {
  if (!seconds) return null;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor(seconds / 60)}m`;
};

/** One metric with a label, value and bar. */
const Stat = ({ icon: Icon, label, value, unit, percent }) => (
  <div className="flex-1 min-w-[74px]">
    <div className="flex items-center gap-1 mb-1">
      <Icon className="w-3 h-3 text-ctext-dim" />
      <span className="text-[7px] tracking-[2px] uppercase text-ctext-dim">
        {label}
      </span>
    </div>
    <div className="flex items-baseline gap-0.5">
      <span className="font-spectral text-lg leading-none text-crystal-blue">
        {value ?? "—"}
      </span>
      {value != null && unit && (
        <span className="text-[9px] text-ctext-mid">{unit}</span>
      )}
    </div>
    {percent != null && (
      <div className="crystal-bar-track mt-1.5 h-1">
        <div
          className={`crystal-bar-fill ${barClass(percent)}`}
          style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
        />
      </div>
    )}
  </div>
);

const NodeCard = memo(function NodeCard({ node, isSelected, onSelect }) {
  const status = STATUS_STYLES[node.status] ?? STATUS_STYLES.offline;
  const summary = node.summary;
  const unreachable = node.status === "offline" || node.status === "disabled";

  const round = (value) =>
    value == null ? null : Math.round(Number(value));

  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      aria-pressed={isSelected}
      className={`glass-card glass-refraction text-left p-3 transition-all min-w-[260px] flex-1 ${
        isSelected
          ? "border-crystal-blue/60 bg-crystal-blue/5"
          : "hover:bg-glass-hover border-glass-border"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${status.dot}`}
            style={
              status.glow
                ? { boxShadow: "0 0 6px rgba(56, 189, 248, 0.8)" }
                : undefined
            }
          />
          <span className="text-xs font-medium text-ctext truncate">
            {node.name}
          </span>
          {node.isLocal && (
            <span className="text-[7px] tracking-[1.5px] uppercase text-ctext-dim border border-glass-border px-1 py-0.5 rounded-sm shrink-0">
              Hub
            </span>
          )}
        </div>
        <span className={`text-[8px] uppercase tracking-[1.5px] ${status.label}`}>
          {node.status}
        </span>
      </div>

      {unreachable ? (
        <p className="text-[10px] text-ctext-dim py-3">
          {node.error ? `Unreachable — ${node.error}` : "No data"}
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <Stat
              icon={Cpu}
              label="CPU"
              value={round(summary?.cpuLoad)}
              unit="%"
              percent={summary?.cpuLoad}
            />
            <Stat
              icon={MemoryStick}
              label="RAM"
              value={round(summary?.memoryUsedPercentage)}
              unit="%"
              percent={summary?.memoryUsedPercentage}
            />
            <Stat
              icon={Thermometer}
              label="Temp"
              value={round(summary?.temperature)}
              unit="°C"
              percent={
                summary?.temperature == null
                  ? null
                  : (summary.temperature / 90) * 100
              }
            />
            <Stat
              icon={HardDrive}
              label="Disk"
              value={round(summary?.diskUsedPercentage)}
              unit="%"
              percent={summary?.diskUsedPercentage}
            />
          </div>

          <div className="flex items-center gap-3 mt-2.5 pt-2 border-t border-glass-border text-[8px] text-ctext-dim">
            {summary?.containersRunning != null && (
              <span>
                {summary.containersRunning}/{summary.containersTotal ?? "?"}{" "}
                containers
              </span>
            )}
            {formatUptime(summary?.uptime) && (
              <span>{formatUptime(summary.uptime)} up</span>
            )}
            {summary?.cpuBrand && (
              <span className="truncate hidden lg:inline">
                {summary.cpuBrand}
              </span>
            )}
          </div>
        </>
      )}
    </button>
  );
});

/**
 * The all-nodes overview. Clicking a card focuses the detail panels on that
 * machine; the strip itself always shows every node at once.
 */
const FleetStrip = ({ nodes, selectedId, onSelect, onManage }) => (
  <section className="mb-6">
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-[9px] tracking-[4px] uppercase text-ctext-dim flex items-center gap-2">
        <Server className="w-3 h-3" />
        Fleet
      </h2>
      <button
        type="button"
        onClick={onManage}
        className="glass-pill text-[9px] text-ctext-mid hover:text-ctext transition-colors flex items-center gap-1"
      >
        <Plus className="w-3 h-3" />
        Manage nodes
      </button>
    </div>

    {nodes.length === 0 ? (
      <div className="glass-card p-4 text-xs text-ctext-mid text-center">
        No nodes registered.
      </div>
    ) : (
      <div className="flex gap-3 flex-wrap">
        {nodes.map((node) => (
          <NodeCard
            key={node.id}
            node={node}
            isSelected={node.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    )}
  </section>
);

export default memo(FleetStrip);
