import { memo } from "react";
import {
  Cpu,
  HardDrive,
  Thermometer,
  Package,
  ArrowDown,
  ArrowUp,
} from "lucide-react";

const iconColorClasses = {
  blue: "text-blue-400",
  green: "text-green-400",
  orange: "text-orange-400",
  purple: "text-purple-400",
  red: "text-red-400",
  yellow: "text-yellow-400",
  cyan: "text-cyan-400",
};

const getBarClass = (percentage) => {
  if (percentage === undefined) return "crystal-bar-blue";
  if (percentage < 50) return "crystal-bar-teal";
  if (percentage < 75) return "crystal-bar-seafoam";
  if (percentage < 90) return "crystal-bar-blue";
  return "crystal-bar-warn";
};

const MetricCard = ({
  title,
  value,
  unit,
  icon: Icon,
  color = "blue",
  percentage,
}) => {
  return (
    <div className="glass-card glass-card-accent-blue p-4 text-center relative overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[7px] tracking-[3px] uppercase text-ctext-dim font-source-code">
          {title}
        </h3>
        <Icon
          className={`w-4 h-4 ${iconColorClasses[color] || "text-blue-400"}`}
        />
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className="font-spectral text-3xl text-crystal-blue"
          style={{ textShadow: "0 0 18px rgba(56, 189, 248, 0.5)" }}
        >
          {value}
        </span>
        {unit && (
          <span className="text-ctext-mid text-sm font-source-code">
            {unit}
          </span>
        )}
      </div>
      {percentage !== undefined && (
        <div className="mt-3">
          <div className="crystal-bar-track">
            <div
              className={`crystal-bar-fill ${getBarClass(percentage)}`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

const formatBytes = (bytes) => {
  if (!bytes) return "0";
  const gb = (bytes / 1024 ** 3).toFixed(1);
  return gb;
};

/**
 * The selected node's headline figures.
 *
 * Everything here comes from that node's `summary`, which the fleet strip is
 * already streaming, so these six cards cost no additional collection.
 */
const MetricsPanel = ({ summary }) => {
  const toMbps = (bytesPerSecond) =>
    bytesPerSecond ? ((bytesPerSecond * 8) / 1_000_000).toFixed(1) : "0";

  const downloadMbps = toMbps(summary?.rxSec);
  const uploadMbps = toMbps(summary?.txSec);

  // Scaled against a gigabit link so a saturated LAN fills the bar.
  const linkPercent = (mbps) => (parseFloat(mbps) / 1000) * 100;

  const round = (value) =>
    value == null ? null : Number(value).toFixed(1).replace(/\.0$/, "");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      <MetricCard
        title="CPU Load"
        value={round(summary?.cpuLoad) ?? "0"}
        unit="%"
        icon={Cpu}
        color="blue"
        percentage={summary?.cpuLoad ?? 0}
      />

      <MetricCard
        title="Memory Usage"
        value={round(summary?.memoryUsedPercentage) ?? "0"}
        unit="%"
        icon={HardDrive}
        color="green"
        percentage={summary?.memoryUsedPercentage ?? 0}
      />

      <MetricCard
        title="CPU Temperature"
        value={round(summary?.temperature) ?? "N/A"}
        unit={summary?.temperature != null ? "\u00B0C" : ""}
        icon={Thermometer}
        color="orange"
        percentage={
          summary?.temperature != null ? (summary.temperature / 90) * 100 : 0
        }
      />

      <MetricCard
        title="Docker Containers"
        value={summary?.containersRunning ?? "0"}
        unit={`/ ${summary?.containersTotal ?? 0}`}
        icon={Package}
        color="purple"
      />

      <MetricCard
        title="Download"
        value={downloadMbps}
        unit="Mb/s"
        icon={ArrowDown}
        color="green"
        percentage={linkPercent(downloadMbps)}
      />

      <MetricCard
        title="Upload"
        value={uploadMbps}
        unit="Mb/s"
        icon={ArrowUp}
        color="blue"
        percentage={linkPercent(uploadMbps)}
      />
    </div>
  );
};

export default memo(MetricsPanel);
