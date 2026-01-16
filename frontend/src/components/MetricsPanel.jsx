import {
  Cpu,
  HardDrive,
  Thermometer,
  Package,
  ArrowDown,
  ArrowUp,
} from "lucide-react";

const MetricCard = ({
  title,
  value,
  unit,
  icon: Icon,
  color = "blue",
  percentage,
}) => {
  // Determine bar color based on percentage
  const getBarColor = () => {
    if (percentage === undefined) return "bg-blue-500";

    if (percentage < 50) {
      return "bg-green-500";
    } else if (percentage < 75) {
      return "bg-yellow-500";
    } else if (percentage < 90) {
      return "bg-orange-500";
    } else {
      return "bg-red-500";
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-slate-400 text-sm font-medium">{title}</h3>
        <Icon className={`w-5 h-5 text-${color}-400`} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-slate-100">{value}</span>
        {unit && <span className="text-slate-400 text-lg">{unit}</span>}
      </div>
      {percentage !== undefined && (
        <div className="mt-3">
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div
              className={`${getBarColor()} h-2 rounded-full transition-all duration-300`}
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
  // Calculate network speed as percentage of 1000 Mb/s (125 MB/s)
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
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
        unit={temperature?.cpu ? "°C" : ""}
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
