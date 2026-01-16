import { useState, useEffect } from "react";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { fetchProcesses } from "../api/api";

const ProcessPanel = ({ refreshInterval }) => {
  const [processData, setProcessData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("cpu"); // cpu, mem, name
  const [sortDirection, setSortDirection] = useState("desc");
  const [displayLimit, setDisplayLimit] = useState(20);

  const fetchData = async () => {
    try {
      const data = await fetchProcesses();
      setProcessData(data);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching process data:", err);
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

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortDirection("desc");
    }
  };

  const formatMem = (memRssMB) => {
    if (!memRssMB || memRssMB === 0) return "0 MB";
    if (memRssMB < 1024) return `${memRssMB.toFixed(1)} MB`;
    const gb = memRssMB / 1024;
    return `${gb.toFixed(2)} GB`;
  };

  const getSortIcon = (column) => {
    if (sortBy !== column)
      return <ArrowUpDown className="w-3 h-3 text-slate-500" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3 h-3 text-blue-400" />
    ) : (
      <ArrowDown className="w-3 h-3 text-blue-400" />
    );
  };

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700">
        <div className="p-6">
          <div className="text-slate-400 text-center">Loading processes...</div>
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

  // Filter and sort processes
  let filteredProcesses = processData?.list || [];

  // Apply search filter
  if (searchTerm) {
    filteredProcesses = filteredProcesses.filter(
      (proc) =>
        proc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        proc.command.toLowerCase().includes(searchTerm.toLowerCase()) ||
        proc.user.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  // Apply sorting
  filteredProcesses = [...filteredProcesses].sort((a, b) => {
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

  // Limit display
  const displayedProcesses = filteredProcesses.slice(0, displayLimit);

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
              Process Monitor
            </h2>
            <span className="text-sm text-slate-400">
              ({processData?.running || 0} running / {processData?.all || 0}{" "}
              total)
            </span>
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
          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search processes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-700 text-slate-100 pl-10 pr-4 py-2 rounded border border-slate-600 focus:outline-none focus:border-blue-500 text-sm"
              />
            </div>

            {/* Display Limit */}
            <select
              value={displayLimit}
              onChange={(e) => setDisplayLimit(Number(e.target.value))}
              className="bg-slate-700 text-slate-100 px-3 py-2 rounded border border-slate-600 focus:outline-none focus:border-blue-500 text-sm"
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
              <thead>
                <tr className="border-b border-slate-700">
                  <th
                    className="text-left py-3 px-2 text-slate-400 font-medium cursor-pointer hover:text-slate-300"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center gap-1">
                      Process {getSortIcon("name")}
                    </div>
                  </th>
                  <th className="text-left py-3 px-2 text-slate-400 font-medium hidden md:table-cell">
                    User
                  </th>
                  <th
                    className="text-right py-3 px-2 text-slate-400 font-medium cursor-pointer hover:text-slate-300"
                    onClick={() => handleSort("cpu")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      CPU % {getSortIcon("cpu")}
                    </div>
                  </th>
                  <th
                    className="text-right py-3 px-2 text-slate-400 font-medium cursor-pointer hover:text-slate-300"
                    onClick={() => handleSort("mem")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Memory % {getSortIcon("mem")}
                    </div>
                  </th>
                  <th className="text-right py-3 px-2 text-slate-400 font-medium hidden lg:table-cell">
                    RAM
                  </th>
                  <th className="text-center py-3 px-2 text-slate-400 font-medium hidden sm:table-cell">
                    PID
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedProcesses.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-8 text-slate-400">
                      No processes found
                    </td>
                  </tr>
                ) : (
                  displayedProcesses.map((proc) => (
                    <tr
                      key={proc.pid}
                      className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="py-2 px-2">
                        <div className="text-slate-100 font-medium truncate max-w-[200px]">
                          {proc.name}
                        </div>
                        <div className="text-xs text-slate-500 truncate max-w-[200px] md:hidden">
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
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Info */}
          {filteredProcesses.length > displayLimit && (
            <div className="mt-4 text-center text-sm text-slate-400">
              Showing {displayLimit} of {filteredProcesses.length} processes
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProcessPanel;
