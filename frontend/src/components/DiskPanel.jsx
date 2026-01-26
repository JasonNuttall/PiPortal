import { HardDrive, Eye, EyeOff, Check } from "lucide-react";
import { useState, useMemo, useRef, useEffect } from "react";
import BasePanel from "./BasePanel";

const DiskPanel = ({
  data,
  isCollapsed,
  onCollapseChange,
  panelId,
  dataMode,
  onModeChange,
  wsConnected,
  hiddenPartitions = [],
  onHiddenPartitionsChange,
}) => {
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsFilterDropdownOpen(false);
      }
    };
    if (isFilterDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isFilterDropdownOpen]);

  // Get all available partition mount points
  const allPartitions = useMemo(() => {
    return data?.map(disk => disk.mount) || [];
  }, [data]);

  // Filter visible disks
  const visibleDisks = useMemo(() => {
    if (!data) return [];
    return data.filter(disk => !hiddenPartitions.includes(disk.mount));
  }, [data, hiddenPartitions]);

  // Toggle partition visibility
  const handleTogglePartition = (mountPoint) => {
    const isHidden = hiddenPartitions.includes(mountPoint);
    const newHiddenPartitions = isHidden
      ? hiddenPartitions.filter(p => p !== mountPoint)
      : [...hiddenPartitions, mountPoint];
    onHiddenPartitionsChange(newHiddenPartitions);
  };

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

  const FilterButton = (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsFilterDropdownOpen(!isFilterDropdownOpen);
        }}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-all bg-slate-600/50 text-slate-300 border border-slate-500/50 hover:bg-slate-600 hover:text-slate-100"
        title="Filter partitions"
      >
        {hiddenPartitions.length > 0 ? (
          <>
            <EyeOff className="w-3 h-3" />
            <span>{hiddenPartitions.length} hidden</span>
          </>
        ) : (
          <>
            <Eye className="w-3 h-3" />
            <span>Filter</span>
          </>
        )}
      </button>

      {isFilterDropdownOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50">
          <div className="p-2">
            <div className="text-xs font-semibold text-slate-400 px-2 py-1 mb-1">
              Show/Hide Partitions
            </div>
            <div className="space-y-0.5">
              {allPartitions.map((mountPoint) => {
                const isVisible = !hiddenPartitions.includes(mountPoint);
                return (
                  <button
                    key={mountPoint}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePartition(mountPoint);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-700 rounded transition-colors"
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                      isVisible
                        ? 'bg-blue-600 border-blue-600'
                        : 'bg-slate-700 border-slate-500'
                    }`}>
                      {isVisible && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="flex-1 text-left font-mono">{mountPoint}</span>
                  </button>
                );
              })}
            </div>
            {hiddenPartitions.length > 0 && (
              <div className="border-t border-slate-700 mt-2 pt-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onHiddenPartitionsChange([]);
                  }}
                  className="w-full text-xs text-blue-400 hover:text-blue-300 px-2 py-1 text-center"
                >
                  Show All
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <BasePanel
      title="Disk Storage"
      icon={HardDrive}
      iconColor="text-purple-400"
      data={data}
      isCollapsed={isCollapsed}
      onCollapseChange={onCollapseChange}
      panelId={panelId}
      dataMode={dataMode}
      onModeChange={onModeChange}
      wsConnected={wsConnected}
      headerActions={FilterButton}
      subtitle={visibleDisks ? `(${visibleDisks.length}/${allPartitions.length})` : ""}
    >
      {() => (
        <div className="space-y-4">
          {visibleDisks?.map((disk) => (
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
