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

  const allPartitions = useMemo(() => {
    return data?.map(disk => disk.mount) || [];
  }, [data]);

  const visibleDisks = useMemo(() => {
    if (!data) return [];
    return data.filter(disk => !hiddenPartitions.includes(disk.mount));
  }, [data, hiddenPartitions]);

  const handleTogglePartition = (mountPoint) => {
    const isHidden = hiddenPartitions.includes(mountPoint);
    const newHiddenPartitions = isHidden
      ? hiddenPartitions.filter(p => p !== mountPoint)
      : [...hiddenPartitions, mountPoint];
    onHiddenPartitionsChange(newHiddenPartitions);
  };

  const getBarClass = (percentage) => {
    if (percentage < 50) return "crystal-bar-teal";
    if (percentage < 75) return "crystal-bar-seafoam";
    if (percentage < 90) return "crystal-bar-blue";
    return "crystal-bar-warn";
  };

  const getUsageTextColor = (percentage) => {
    if (percentage < 50) return "text-crystal-teal";
    if (percentage < 75) return "text-crystal-seafoam";
    if (percentage < 90) return "text-crystal-blue";
    return "text-red-400";
  };

  const FilterButton = (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsFilterDropdownOpen(!isFilterDropdownOpen);
        }}
        className="flex items-center gap-1.5 px-2 py-1 rounded-sm text-xs font-medium transition-all bg-glass text-ctext-mid border border-glass-border hover:bg-glass-hover hover:text-ctext"
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
        <div className="absolute right-0 mt-2 w-56 bg-crystal-void border border-glass-border rounded-sm shadow-xl z-50"
          style={{ backdropFilter: "blur(20px)" }}
        >
          <div className="p-2">
            <div className="text-[8px] tracking-[2px] uppercase text-ctext-dim px-2 py-1 mb-1">
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
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-ctext-mid hover:bg-glass-hover rounded-sm transition-colors"
                  >
                    <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${
                      isVisible
                        ? 'bg-crystal-blue/30 border-crystal-blue/60'
                        : 'bg-glass border-glass-border'
                    }`}>
                      {isVisible && <Check className="w-2.5 h-2.5 text-crystal-blue" />}
                    </div>
                    <span className="flex-1 text-left font-source-code">{mountPoint}</span>
                  </button>
                );
              })}
            </div>
            {hiddenPartitions.length > 0 && (
              <div className="border-t border-glass-border mt-2 pt-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onHiddenPartitionsChange([]);
                  }}
                  className="w-full text-xs text-crystal-blue hover:text-crystal-teal px-2 py-1 text-center transition-colors"
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
      iconColor="text-crystal-seafoam"
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
        <div className="space-y-3">
          {visibleDisks?.map((disk) => (
            <div
              key={disk.mount}
              className="p-3 rounded-sm bg-glass border border-glass-border"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-ctext text-[10px] font-medium">
                    {disk.mount}
                  </span>
                  <span className="text-[8px] text-ctext-dim font-source-code">
                    {disk.type}
                  </span>
                </div>
                <span
                  className={`text-sm font-semibold font-spectral ${getUsageTextColor(disk.use)}`}
                >
                  {disk.use.toFixed(1)}%
                </span>
              </div>

              {/* Crystal progress bar */}
              <div className="crystal-bar-track mb-2">
                <div
                  className={`crystal-bar-fill ${getBarClass(disk.use)}`}
                  style={{ width: `${Math.min(disk.use, 100)}%` }}
                />
              </div>

              {/* Storage info */}
              <div className="flex justify-between text-[9px] font-source-code">
                <div className="text-ctext-dim">
                  <span className="text-ctext-mid">{disk.usedGB} GB</span> used
                </div>
                <div className="text-ctext-dim">
                  <span className="text-ctext-mid">{disk.availableGB} GB</span> free
                </div>
                <div className="text-ctext-dim">
                  <span className="text-ctext-mid">{disk.sizeGB} GB</span> total
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
