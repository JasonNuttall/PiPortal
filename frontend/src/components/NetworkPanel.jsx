import { useState, useRef, useEffect } from "react";
import { Activity, ArrowUp, ArrowDown } from "lucide-react";
import BasePanel from "./BasePanel";

const NetworkPanel = ({
  data,
  isCollapsed,
  onCollapseChange,
  panelId,
  dataMode,
  onModeChange,
  wsConnected,
}) => {
  const [calculatedSpeeds, setCalculatedSpeeds] = useState({});
  const previousDataRef = useRef(null);
  const previousTimeRef = useRef(null);

  useEffect(() => {
    if (!data || !data.stats) return;

    const currentTime = Date.now();
    const speeds = {};

    data.stats.forEach((stat) => {
      const hasBackendSpeed = stat.rx_sec > 0 || stat.tx_sec > 0;

      if (hasBackendSpeed) {
        speeds[stat.interface] = {
          rx_speed: stat.rx_sec,
          tx_speed: stat.tx_sec,
        };
      } else if (previousDataRef.current && previousTimeRef.current) {
        const timeDiff = (currentTime - previousTimeRef.current) / 1000;
        const prevStat = previousDataRef.current.stats?.find(
          (s) => s.interface === stat.interface,
        );

        if (prevStat && timeDiff > 0 && timeDiff < 10) {
          const rxDiff = Math.max(0, stat.rx_bytes - prevStat.rx_bytes);
          const txDiff = Math.max(0, stat.tx_bytes - prevStat.tx_bytes);

          speeds[stat.interface] = {
            rx_speed: rxDiff / timeDiff,
            tx_speed: txDiff / timeDiff,
          };
        }
      }
    });

    if (Object.keys(speeds).length > 0) {
      setCalculatedSpeeds(speeds);
    }

    previousDataRef.current = data;
    previousTimeRef.current = currentTime;
  }, [data]);

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

  return (
    <BasePanel
      title="Live Network Traffic"
      icon={Activity}
      iconColor="text-crystal-blue"
      data={data}
      isCollapsed={isCollapsed}
      onCollapseChange={onCollapseChange}
      panelId={panelId}
      dataMode={dataMode}
      onModeChange={onModeChange}
      wsConnected={wsConnected}
    >
      {(networkData) => (
        <div className="space-y-3">
          {networkData?.stats?.map((stat) => {
            const speed = calculatedSpeeds[stat.interface] || {
              rx_speed: stat.rx_sec,
              tx_speed: stat.tx_sec,
            };
            const hasTraffic = speed.rx_speed > 0 || speed.tx_speed > 0;

            return (
              <div
                key={stat.interface}
                className={`p-3 rounded-sm border transition-colors ${
                  hasTraffic
                    ? "bg-crystal-teal/5 border-crystal-teal/20"
                    : "bg-glass border-glass-border"
                }`}
              >
                <div className="text-sm font-medium text-ctext mb-3">
                  {stat.interface}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {/* Download */}
                  <div>
                    <div className="flex items-center text-crystal-blue mb-2">
                      <ArrowDown className="w-3.5 h-3.5 mr-1" />
                      <span className="font-medium text-xs">Download</span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-ctext-dim">Speed:</span>
                        <span className="font-source-code text-ctext">
                          {formatSpeed(speed.rx_speed)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ctext-dim">Total:</span>
                        <span className="font-source-code text-ctext-mid">
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
                    <div className="flex items-center text-crystal-teal mb-2">
                      <ArrowUp className="w-3.5 h-3.5 mr-1" />
                      <span className="font-medium text-xs">Upload</span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-ctext-dim">Speed:</span>
                        <span className="font-source-code text-ctext">
                          {formatSpeed(speed.tx_speed)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ctext-dim">Total:</span>
                        <span className="font-source-code text-ctext-mid">
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
      )}
    </BasePanel>
  );
};

export default NetworkPanel;
