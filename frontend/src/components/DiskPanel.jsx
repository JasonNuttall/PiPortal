import { HardDrive } from "lucide-react";
import { fetchDetailedDiskInfo } from "../api/api";
import BasePanel from "./BasePanel";

const DiskPanel = ({ refreshInterval }) => {
  const getUsageColor = (percentage) => {
    if (percentage < 50) return "bg-green-500";
    if (percentage < 75) return "bg-yellow-500";
    if (percentage < 90) return "bg-orange-500";
    return "bg-red-500";
  };

  const getUsageTextColor = (percentage) => {
    if (percentage < 50) return "text-green-400";
    if (percentage < 75) return "text-yellow-400";
    if (percentage < 90) return "text-orange-400";
    return "text-red-400";
  };

  return (
    <BasePanel
      title="Disk Storage"
      icon={HardDrive}
      iconColor="text-purple-400"
      fetchData={fetchDetailedDiskInfo}
      refreshInterval={refreshInterval}
    >
      {(diskData) => (
        <div className="space-y-4">
          {diskData?.map((disk) => (
            <div
              key={disk.mount}
              className="p-4 rounded-lg bg-slate-700/50 border border-slate-600"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-slate-100 font-medium">
                    {disk.mount}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {disk.type}
                  </span>
                </div>
                <span
                  className={`text-lg font-bold ${getUsageTextColor(disk.use)}`}
                >
                  {disk.use.toFixed(1)}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-600 rounded-full h-2.5 mb-3">
                <div
                  className={`${getUsageColor(
                    disk.use
                  )} h-2.5 rounded-full transition-all duration-300`}
                  style={{ width: `${Math.min(disk.use, 100)}%` }}
                />
              </div>

              {/* Storage info */}
              <div className="flex justify-between text-sm">
                <div className="text-slate-400">
                  <span className="text-slate-300 font-medium">
                    {disk.usedGB} GB
                  </span>{" "}
                  used
                </div>
                <div className="text-slate-400">
                  <span className="text-slate-300 font-medium">
                    {disk.availableGB} GB
                  </span>{" "}
                  free
                </div>
                <div className="text-slate-400">
                  <span className="text-slate-300 font-medium">
                    {disk.sizeGB} GB
                  </span>{" "}
                  total
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </BasePanel>
  );
};

export default DiskPanel;
