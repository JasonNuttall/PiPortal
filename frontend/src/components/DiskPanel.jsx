import { useState, useEffect } from "react";
import { HardDrive, Database } from "lucide-react";
import { fetchDetailedDiskInfo } from "../api/api";

const DiskPanel = ({ refreshInterval }) => {
  const [diskData, setDiskData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      const data = await fetchDetailedDiskInfo();
      setDiskData(data);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching disk data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    if (refreshInterval > 0) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval]);

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

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
        <div className="flex items-center justify-center h-32">
          <div className="text-slate-400">Loading disk data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
        <div className="flex items-center mb-4">
          <HardDrive className="w-6 h-6 text-purple-400 mr-2" />
          <h2 className="text-xl font-semibold text-slate-100">Disk Storage</h2>
        </div>
        <div className="flex items-center justify-center h-20">
          <div className="text-red-400">Error: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
      <div className="flex items-center mb-6">
        <HardDrive className="w-6 h-6 text-purple-400 mr-2" />
        <h2 className="text-xl font-semibold text-slate-100">Disk Storage</h2>
      </div>

      <div className="space-y-4">
        {diskData?.map((disk, index) => (
          <div
            key={index}
            className="p-4 rounded-lg bg-slate-700/50 border border-slate-600"
          >
            {/* Disk Header */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Database className="w-4 h-4 text-purple-400" />
                  <span className="font-semibold text-slate-100">
                    {disk.mount}
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  {disk.fs} ({disk.type})
                </div>
              </div>
              <div
                className={`text-2xl font-bold ${getUsageTextColor(disk.use)}`}
              >
                {disk.use.toFixed(1)}%
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-3">
              <div className="w-full bg-slate-600 rounded-full h-3">
                <div
                  className={`${getUsageColor(
                    disk.use
                  )} h-3 rounded-full transition-all duration-300`}
                  style={{ width: `${Math.min(disk.use, 100)}%` }}
                />
              </div>
            </div>

            {/* Disk Stats */}
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-slate-400 text-xs mb-1">Used</div>
                <div className="text-slate-100 font-semibold">
                  {disk.usedGB} GB
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-xs mb-1">Available</div>
                <div className="text-slate-100 font-semibold">
                  {disk.availableGB} GB
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-xs mb-1">Total</div>
                <div className="text-slate-100 font-semibold">
                  {disk.sizeGB} GB
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DiskPanel;
