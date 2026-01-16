import { useState, useEffect, useRef } from "react";
import {
  Network,
  Activity,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { fetchNetworkMetrics } from "../api/api";

const NetworkPanel = ({ refreshInterval }) => {
  const [networkData, setNetworkData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [calculatedSpeeds, setCalculatedSpeeds] = useState({});
  const previousDataRef = useRef(null);
  const previousTimeRef = useRef(null);

  const fetchData = async () => {
    try {
      const data = await fetchNetworkMetrics();

      // Calculate speeds based on byte differences if we have previous data
      if (previousDataRef.current && previousTimeRef.current) {
        const currentTime = Date.now();
        const timeDiff = (currentTime - previousTimeRef.current) / 1000; // seconds

        const speeds = {};
        data.stats.forEach((stat) => {
          const prevStat = previousDataRef.current.stats.find(
            (s) => s.interface === stat.interface
          );

          if (prevStat && timeDiff > 0) {
            const rxDiff = Math.max(0, stat.rx_bytes - prevStat.rx_bytes);
            const txDiff = Math.max(0, stat.tx_bytes - prevStat.tx_bytes);

            speeds[stat.interface] = {
              rx_speed: rxDiff / timeDiff,
              tx_speed: txDiff / timeDiff,
            };
          }
        });

        setCalculatedSpeeds(speeds);
      }

      previousDataRef.current = data;
      previousTimeRef.current = Date.now();
      setNetworkData(data);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching network data:", err);
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

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatSpeed = (bytesPerSec) => {
    if (!bytesPerSec || bytesPerSec === 0) return "0 B/s";
    const k = 1024;
    const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    return (
      parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
    );
  };

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700">
        <div className="p-6">
          <div className="text-slate-400 text-center">
            Loading network data...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700">
        <div className="p-6">
          <div className="text-red-400 text-center">Error: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700">
      <div
        className="p-6 border-b border-slate-700 cursor-pointer hover:bg-slate-700/50 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-bold text-slate-100">
              Live Network Traffic
            </h2>
          </div>
          {isCollapsed ? (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-6">
          <div className="space-y-3">
            {networkData?.stats?.map((stat, index) => {
              // Use calculated speeds if available, otherwise fall back to API data
              const speed = calculatedSpeeds[stat.interface] || {
                rx_speed: stat.rx_sec,
                tx_speed: stat.tx_sec,
              };
              const hasTraffic = speed.rx_speed > 0 || speed.tx_speed > 0;

              return (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${
                    hasTraffic
                      ? "bg-green-900/20 border-green-700"
                      : "bg-slate-700/30 border-slate-600"
                  }`}
                >
                  <div className="font-semibold text-slate-100 mb-3">
                    {stat.interface}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Download */}
                    <div>
                      <div className="flex items-center text-green-400 mb-2">
                        <ArrowDown className="w-4 h-4 mr-1" />
                        <span className="font-semibold text-sm">Download</span>
                      </div>
                      <div className="space-y-1 text-xs text-slate-300">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Speed:</span>
                          <span className="font-mono">
                            {formatSpeed(speed.rx_speed)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Total:</span>
                          <span className="font-mono">
                            {formatBytes(stat.rx_bytes)}
                          </span>
                        </div>
                        {stat.rx_errors > 0 && (
                          <div className="flex justify-between text-red-400">
                            <span>Errors:</span>
                            <span>{stat.rx_errors}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Upload */}
                    <div>
                      <div className="flex items-center text-blue-400 mb-2">
                        <ArrowUp className="w-4 h-4 mr-1" />
                        <span className="font-semibold text-sm">Upload</span>
                      </div>
                      <div className="space-y-1 text-xs text-slate-300">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Speed:</span>
                          <span className="font-mono">
                            {formatSpeed(speed.tx_speed)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Total:</span>
                          <span className="font-mono">
                            {formatBytes(stat.tx_bytes)}
                          </span>
                        </div>
                        {stat.tx_errors > 0 && (
                          <div className="flex justify-between text-red-400">
                            <span>Errors:</span>
                            <span>{stat.tx_errors}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default NetworkPanel;
