import { useState, useEffect, useRef } from "react";
import { Network, Activity, Wifi, WifiOff, ArrowUp, ArrowDown } from "lucide-react";
import { fetchNetworkMetrics } from "../api/api";

const NetworkPanel = ({ refreshInterval }) => {
  const [networkData, setNetworkData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
        data.stats.forEach(stat => {
          const prevStat = previousDataRef.current.stats.find(
            s => s.interface === stat.interface
          );
          
          if (prevStat && timeDiff > 0) {
            const rxDiff = Math.max(0, stat.rx_bytes - prevStat.rx_bytes);
            const txDiff = Math.max(0, stat.tx_bytes - prevStat.tx_bytes);
            
            speeds[stat.interface] = {
              rx_speed: rxDiff / timeDiff,
              tx_speed: txDiff / timeDiff
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
    return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
        <div className="flex items-center justify-center h-32">
          <div className="text-slate-400">Loading network data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
        <div className="flex items-center mb-4">
          <Network className="w-6 h-6 text-blue-400 mr-2" />
          <h2 className="text-xl font-semibold text-slate-100">Network Monitoring</h2>
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
        <Network className="w-6 h-6 text-blue-400 mr-2" />
        <h2 className="text-xl font-semibold text-slate-100">Network Monitoring</h2>
      </div>

      <div className="space-y-6">
        {/* Network Interfaces */}
        <div>
          <h3 className="text-sm font-semibold text-slate-400 mb-3 flex items-center">
            <Wifi className="w-4 h-4 mr-1" />
            Network Interfaces
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {networkData?.interfaces?.map((iface, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border ${
                  iface.isDefault
                    ? "bg-blue-900/30 border-blue-700"
                    : "bg-slate-700/50 border-slate-600"
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    {iface.operstate === "up" ? (
                      <Wifi className="w-4 h-4 text-green-400" />
                    ) : (
                      <WifiOff className="w-4 h-4 text-red-400" />
                    )}
                    <span className="font-semibold text-slate-100">{iface.name}</span>
                  </div>
                  {iface.isDefault && (
                    <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">
                      Default
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300">
                  {iface.ip4 && (
                    <div>
                      <span className="text-slate-400">IPv4:</span> {iface.ip4}
                    </div>
                  )}
                  {iface.mac && (
                    <div>
                      <span className="text-slate-400">MAC:</span> {iface.mac}
                    </div>
                  )}
                  {iface.speed > 0 && (
                    <div>
                      <span className="text-slate-400">Speed:</span> {iface.speed} Mbps
                    </div>
                  )}
                  {iface.type && (
                    <div>
                      <span className="text-slate-400">Type:</span> {iface.type}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Network Statistics */}
        <div>
          <h3 className="text-sm font-semibold text-slate-400 mb-3 flex items-center">
            <Activity className="w-4 h-4 mr-1" />
            Live Traffic
          </h3>
          <div className="space-y-3">
            {networkData?.stats?.map((stat, index) => {
              // Use calculated speeds if available, otherwise fall back to API data
              const speed = calculatedSpeeds[stat.interface] || {
                rx_speed: stat.rx_sec,
                tx_speed: stat.tx_sec
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
                  <div className="font-semibold text-slate-100 mb-3">{stat.interface}</div>
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
                          <span className="font-mono">{formatSpeed(speed.rx_speed)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Total:</span>
                          <span className="font-mono">{formatBytes(stat.rx_bytes)}</span>
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
                          <span className="font-mono">{formatSpeed(speed.tx_speed)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Total:</span>
                          <span className="font-mono">{formatBytes(stat.tx_bytes)}</span>
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
      </div>
    </div>
  );
};

export default NetworkPanel;
