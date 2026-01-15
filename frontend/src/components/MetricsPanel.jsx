import { Cpu, HardDrive, Thermometer, Package } from "lucide-react";

const MetricCard = ({
  title,
  value,
  unit,
  icon: Icon,
  color = "blue",
  percentage,
}) => {
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
              className={`bg-${color}-500 h-2 rounded-full transition-all duration-300`}
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
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
    </div>
  );
};

export default MetricsPanel;
