import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * Base Panel Component
 * Provides consistent structure and functionality for all dashboard panels
 *
 * @param {string} title - Panel title
 * @param {React.Component} icon - Lucide icon component
 * @param {React.ReactNode} children - Panel content (function receiving data if fetchData provided, or direct JSX)
 * @param {function} fetchData - Optional async function to fetch panel data
 * @param {any} data - Optional data passed as prop (alternative to fetchData)
 * @param {number} refreshInterval - Refresh interval in milliseconds (only with fetchData)
 * @param {boolean} collapsible - Whether panel can be collapsed (default: true)
 * @param {boolean} defaultCollapsed - Whether panel starts collapsed (default: false)
 * @param {React.ReactNode} headerActions - Optional actions to render in header (e.g., buttons)
 * @param {string} iconColor - Tailwind color class for icon (default: "text-blue-400")
 * @param {string|function} subtitle - Optional subtitle (e.g., count badge) or function receiving data
 */
const BasePanel = ({
  title,
  icon: Icon,
  children,
  fetchData = null,
  data: propData = null,
  refreshInterval,
  collapsible = true,
  defaultCollapsed = false,
  headerActions = null,
  iconColor = "text-blue-400",
  subtitle = null,
}) => {
  const [fetchedData, setFetchedData] = useState(null);
  const [loading, setLoading] = useState(!!fetchData);
  const [error, setError] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  // Determine which data to use (prop data or fetched data)
  const data = propData !== null ? propData : fetchedData;

  // Compute subtitle value (can be string or function)
  const subtitleValue =
    typeof subtitle === "function" ? subtitle(data) : subtitle;

  // Fetch data on mount and interval (only if fetchData is provided)
  useEffect(() => {
    if (!fetchData) return;

    const loadData = async () => {
      try {
        const result = await fetchData();
        setFetchedData(result);
        setError(null);
      } catch (err) {
        setError(err.message);
        console.error(`Error fetching ${title} data:`, err);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    if (refreshInterval > 0) {
      const interval = setInterval(loadData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, refreshInterval, title]);

  // Loading state
  if (loading) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700">
        <div className="p-6">
          <div className="text-slate-400 text-center">
            Loading {title.toLowerCase()}...
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700">
        <div className="p-6">
          <div className="flex items-center mb-4">
            <Icon className={`w-6 h-6 ${iconColor} mr-2`} />
            <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
          </div>
          <div className="text-red-400 text-center">Error: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700">
      {/* Panel Header */}
      <div
        className={`p-4 flex items-center justify-between ${
          collapsible
            ? "cursor-pointer hover:bg-slate-700/30 transition-colors"
            : ""
        } border-b border-slate-700`}
        onClick={collapsible ? () => setIsCollapsed(!isCollapsed) : undefined}
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-6 h-6 ${iconColor} mr-1`} />
          <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
          {subtitleValue && (
            <span className="text-sm text-slate-400">{subtitleValue}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Custom header actions (e.g., Add Service button) */}
          {headerActions && !isCollapsed && (
            <div onClick={(e) => e.stopPropagation()}>{headerActions}</div>
          )}

          {/* Collapse toggle */}
          {collapsible && (
            <button className="text-slate-400 hover:text-slate-200 transition-colors">
              {isCollapsed ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronUp className="w-5 h-5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Panel Content */}
      {!isCollapsed && (
        <div className="p-6">
          {typeof children === "function" ? children(data) : children}
        </div>
      )}
    </div>
  );
};

export default BasePanel;
