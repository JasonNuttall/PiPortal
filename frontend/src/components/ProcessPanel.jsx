import { useState, useMemo } from "react";
import {
  Activity,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { fetchProcesses } from "../api/api";
import BasePanel from "./BasePanel";

const formatMem = (memRssMB) => {
  if (!memRssMB || memRssMB === 0) return "0 MB";
  if (memRssMB < 1024) return `${memRssMB.toFixed(1)} MB`;
  const gb = memRssMB / 1024;
  return `${gb.toFixed(2)} GB`;
};

// Inner component to handle memoized filtering/sorting
const ProcessList = ({ processData, searchTerm, sortBy, sortDirection, displayLimit, onSort, onSearchChange, onLimitChange }) => {
  const getSortIcon = (column) => {
    if (sortBy !== column)
      return <ArrowUpDown className="w-3 h-3 text-slate-500" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3 h-3 text-blue-400" />
    ) : (
      <ArrowDown className="w-3 h-3 text-blue-400" />
    );
  };

  // Memoize filtered and sorted processes to avoid recalculation on every render
  const { displayedProcesses, totalFiltered } = useMemo(() => {
    let filtered = processData?.list || [];

    // Apply search filter
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (proc) =>
          proc.name.toLowerCase().includes(lowerSearch) ||
          proc.command.toLowerCase().includes(lowerSearch) ||
          proc.user.toLowerCase().includes(lowerSearch)
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "cpu":
          comparison = b.cpu - a.cpu;
          break;
        case "mem":
          comparison = b.mem - a.mem;
          break;
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        default:
          comparison = 0;
      }
      return sortDirection === "asc" ? -comparison : comparison;
    });

    return {
      displayedProcesses: sorted.slice(0, displayLimit),
      totalFiltered: sorted.length,
    };
  }, [processData, searchTerm, sortBy, sortDirection, displayLimit]);

  return (
    <>
      {/* Search and Controls */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search processes..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-700 text-slate-100 rounded-lg border border-slate-600 focus:border-blue-500 outline-none"
          />
        </div>
        <select
          value={displayLimit}
          onChange={(e) => onLimitChange(Number(e.target.value))}
          className="px-3 py-2 bg-slate-700 text-slate-100 rounded-lg border border-slate-600 focus:border-blue-500 outline-none"
        >
          <option value={10}>Top 10</option>
          <option value={20}>Top 20</option>
          <option value={50}>Top 50</option>
          <option value={100}>Top 100</option>
        </select>
      </div>

      {/* Process Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-700">
            <tr className="text-left text-slate-400">
              <th className="pb-3 font-medium">
                <button
                  onClick={() => onSort("name")}
                  className="flex items-center gap-1 hover:text-slate-200"
                >
                  Process {getSortIcon("name")}
                </button>
              </th>
              <th className="pb-3 font-medium hidden md:table-cell">
                User
              </th>
              <th className="pb-3 font-medium text-right">
                <button
                  onClick={() => onSort("cpu")}
                  className="flex items-center gap-1 hover:text-slate-200 ml-auto"
                >
                  CPU % {getSortIcon("cpu")}
                </button>
              </th>
              <th className="pb-3 font-medium text-right">
                <button
                  onClick={() => onSort("mem")}
                  className="flex items-center gap-1 hover:text-slate-200 ml-auto"
                >
                  Memory % {getSortIcon("mem")}
                </button>
              </th>
              <th className="pb-3 font-medium text-right hidden lg:table-cell">
                RAM
              </th>
              <th className="pb-3 font-medium text-center hidden sm:table-cell">
                PID
              </th>
            </tr>
          </thead>
          <tbody>
            {displayedProcesses.map((proc) => (
              <tr
                key={proc.pid}
                className="border-b border-slate-700/50 hover:bg-slate-700/30"
              >
                <td className="py-2 px-2">
                  <div className="font-medium text-slate-100 truncate max-w-xs">
                    {proc.name}
                  </div>
                  <div className="text-xs text-slate-500 truncate max-w-xs hidden xl:block">
                    {proc.command}
                  </div>
                </td>
                <td className="py-2 px-2 text-slate-300 hidden md:table-cell">
                  {proc.user}
                </td>
                <td className="py-2 px-2 text-right">
                  <span
                    className={`font-mono ${
                      proc.cpu > 50
                        ? "text-red-400"
                        : proc.cpu > 20
                        ? "text-orange-400"
                        : proc.cpu > 5
                        ? "text-yellow-400"
                        : "text-slate-300"
                    }`}
                  >
                    {proc.cpu.toFixed(1)}%
                  </span>
                </td>
                <td className="py-2 px-2 text-right">
                  <span
                    className={`font-mono ${
                      proc.mem > 10
                        ? "text-red-400"
                        : proc.mem > 5
                        ? "text-orange-400"
                        : proc.mem > 2
                        ? "text-yellow-400"
                        : "text-slate-300"
                    }`}
                  >
                    {proc.mem.toFixed(1)}%
                  </span>
                </td>
                <td className="py-2 px-2 text-right text-slate-300 font-mono text-xs hidden lg:table-cell">
                  {formatMem(proc.memRssMB)}
                </td>
                <td className="py-2 px-2 text-center text-slate-400 font-mono text-xs hidden sm:table-cell">
                  {proc.pid}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="mt-4 text-center text-sm text-slate-400">
        Showing {displayedProcesses.length} of {totalFiltered} processes
      </div>
    </>
  );
};

const ProcessPanel = ({ refreshInterval }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("mem");
  const [sortDirection, setSortDirection] = useState("desc");
  const [displayLimit, setDisplayLimit] = useState(20);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortDirection("desc");
    }
  };

  return (
    <BasePanel
      title="Process Monitor"
      icon={Activity}
      iconColor="text-cyan-400"
      fetchData={fetchProcesses}
      refreshInterval={refreshInterval}
      subtitle={(data) =>
        data ? `(${data.running} running / ${data.all} total)` : ""
      }
    >
      {(processData) => (
        <ProcessList
          processData={processData}
          searchTerm={searchTerm}
          sortBy={sortBy}
          sortDirection={sortDirection}
          displayLimit={displayLimit}
          onSort={handleSort}
          onSearchChange={setSearchTerm}
          onLimitChange={setDisplayLimit}
        />
      )}
    </BasePanel>
  );
};

export default ProcessPanel;
