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

const MetricsPanel = ({
  systemMetrics,
  temperature,
  diskMetrics,
  dockerInfo,
  networkStats,
}) => {
  const downloadMbps = networkStats?.downloadSpeed
    ? ((networkStats.downloadSpeed * 8) / 1000000).toFixed(1)
    : "0";
  const uploadMbps = networkStats?.uploadSpeed
    ? ((networkStats.uploadSpeed * 8) / 1000000).toFixed(1)
    : "0";
  const downloadPercent = networkStats?.downloadSpeed
    ? (parseFloat(downloadMbps) / 1000) * 100
    : 0;
  const uploadPercent = networkStats?.uploadSpeed
    ? (parseFloat(uploadMbps) / 1000) * 100
    : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      <MetricCard
        title="CPU Load"
        value={systemMetrics?.cpu?.currentLoad || "0"}
        unit="%"
        icon={Cpu}
        color="blue"
        percentage={parseFloat(systemMetrics?.cpu?.currentLoad || 0)}
      />

      <MetricCard
        title="Memory Usage"
        value={systemMetrics?.memory?.usedPercentage || "0"}
        unit="%"
        icon={HardDrive}
        color="green"
        percentage={parseFloat(systemMetrics?.memory?.usedPercentage || 0)}
      />

      <MetricCard
        title="CPU Temperature"
        value={temperature?.cpu || "N/A"}
        unit={temperature?.cpu ? "\u00B0C" : ""}
        icon={Thermometer}
        color="orange"
        percentage={
          temperature?.cpu ? (parseFloat(temperature.cpu) / 80) * 100 : 0
        }
      />

      <MetricCard
        title="Docker Containers"
        value={dockerInfo?.containersRunning || "0"}
        unit={`/ ${
          dockerInfo?.containersRunning + dockerInfo?.containersStopped || "0"
        }`}
        icon={Package}
        color="purple"
      />

      <MetricCard
        title="Download"
        value={downloadMbps}
        unit="Mb/s"
        icon={ArrowDown}
        color="green"
        percentage={downloadPercent}
      />

      <MetricCard
        title="Upload"
        value={uploadMbps}
        unit="Mb/s"
        icon={ArrowUp}
        color="blue"
        percentage={uploadPercent}
      />
    </div>
  );
};

export default MetricsPanel;
