import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import Header from "./Header";
import MetricsPanel from "./MetricsPanel";
import DockerPanel from "./DockerPanel";
import ServicesPanel from "./ServicesPanel";
import NetworkPanel from "./NetworkPanel";
import DiskPanel from "./DiskPanel";
import ProcessPanel from "./ProcessPanel";
import SortablePanel from "./SortablePanel";
import {
  fetchSystemMetrics,
  fetchTemperature,
  fetchDiskMetrics,
  fetchDockerContainers,
  fetchDockerInfo,
  fetchServices,
  fetchNetworkMetrics,
  fetchDetailedDiskInfo,
  fetchProcesses,
} from "../api/api";

const Dashboard = () => {
  // Core metrics state (always fetched for MetricsPanel)
  const [systemMetrics, setSystemMetrics] = useState(null);
  const [temperature, setTemperature] = useState(null);
  const [diskMetrics, setDiskMetrics] = useState(null);
  const [dockerInfo, setDockerInfo] = useState(null);
  const [networkStats, setNetworkStats] = useState({
    downloadSpeed: 0,
    uploadSpeed: 0,
  });

  // Panel-specific data (centralized)
  const [dockerContainers, setDockerContainers] = useState([]);
  const [services, setServices] = useState([]);
  const [networkData, setNetworkData] = useState(null);
  const [detailedDiskData, setDetailedDiskData] = useState(null);
  const [processData, setProcessData] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshInterval, setRefreshInterval] = useState(5000);

  // Track collapsed state for each panel (lazy loading)
  const [collapsedPanels, setCollapsedPanels] = useState(() => {
    const saved = localStorage.getItem("collapsedPanels");
    return saved ? JSON.parse(saved) : {};
  });

  // Default panel order - organized by columns
  const defaultPanelOrder = {
    left: ["services", "network"],
    right: ["disk", "processes", "docker"],
  };

  // Load panel order from localStorage or use default
  const [panelOrder, setPanelOrder] = useState(() => {
    const saved = localStorage.getItem("panelOrder");
    return saved ? JSON.parse(saved) : defaultPanelOrder;
  });

  // Track network data for speed calculation
  const previousNetworkDataRef = useRef(null);
  const previousNetworkTimeRef = useRef(null);

  // Setup drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle panel collapse change
  const handleCollapseChange = useCallback((panelId, isCollapsed) => {
    setCollapsedPanels((prev) => {
      const newState = { ...prev, [panelId]: isCollapsed };
      localStorage.setItem("collapsedPanels", JSON.stringify(newState));
      return newState;
    });
  }, []);

  // Handle drag end - memoized to prevent recreation on every render
  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setPanelOrder((panelOrder) => {
        const activeColumn = panelOrder.left.includes(active.id) ? 'left' : 'right';
        const overColumn = panelOrder.left.includes(over.id) ? 'left' : 'right';

        if (activeColumn === overColumn) {
          const columnItems = [...panelOrder[activeColumn]];
          const oldIndex = columnItems.indexOf(active.id);
          const newIndex = columnItems.indexOf(over.id);
          const newColumnOrder = arrayMove(columnItems, oldIndex, newIndex);

          const newOrder = {
            ...panelOrder,
            [activeColumn]: newColumnOrder,
          };

          localStorage.setItem("panelOrder", JSON.stringify(newOrder));
          return newOrder;
        } else {
          const sourceColumn = [...panelOrder[activeColumn]];
          const destColumn = [...panelOrder[overColumn]];

          const itemIndex = sourceColumn.indexOf(active.id);
          sourceColumn.splice(itemIndex, 1);

          const overIndex = destColumn.indexOf(over.id);
          destColumn.splice(overIndex, 0, active.id);

          const newOrder = {
            left: activeColumn === 'left' ? sourceColumn : destColumn,
            right: activeColumn === 'right' ? sourceColumn : destColumn,
          };

          localStorage.setItem("panelOrder", JSON.stringify(newOrder));
          return newOrder;
        }
      });
    }
  }, []);

  // Centralized data loading - only fetches data for expanded panels
  const loadData = useCallback(async () => {
    try {
      setError(null);

      // Always fetch core metrics for the top MetricsPanel
      const corePromises = [
        fetchSystemMetrics().catch((err) => ({ error: err.message })),
        fetchTemperature().catch((err) => ({ error: err.message })),
        fetchDiskMetrics().catch((err) => ({ error: err.message })),
        fetchDockerInfo().catch((err) => ({ error: err.message })),
      ];

      // Conditionally fetch panel data based on collapse state
      const panelPromises = [];
      const panelKeys = [];

      // Docker containers (for DockerPanel)
      if (!collapsedPanels.docker) {
        panelPromises.push(fetchDockerContainers().catch((err) => []));
        panelKeys.push('docker');
      }

      // Services (for ServicesPanel)
      if (!collapsedPanels.services) {
        panelPromises.push(fetchServices().catch((err) => []));
        panelKeys.push('services');
      }

      // Network data (for NetworkPanel)
      if (!collapsedPanels.network) {
        panelPromises.push(fetchNetworkMetrics().catch((err) => null));
        panelKeys.push('network');
      }

      // Disk data (for DiskPanel)
      if (!collapsedPanels.disk) {
        panelPromises.push(fetchDetailedDiskInfo().catch((err) => null));
        panelKeys.push('disk');
      }

      // Process data (for ProcessPanel)
      if (!collapsedPanels.processes) {
        panelPromises.push(fetchProcesses().catch((err) => null));
        panelKeys.push('processes');
      }

      // Execute all fetches in parallel
      const [coreResults, panelResults] = await Promise.all([
        Promise.all(corePromises),
        Promise.all(panelPromises),
      ]);

      // Update core metrics
      const [system, temp, disk, dockerInf] = coreResults;
      setSystemMetrics(system);
      setTemperature(temp);
      setDiskMetrics(disk);
      setDockerInfo(dockerInf);

      // Update panel data based on what was fetched
      panelKeys.forEach((key, index) => {
        const data = panelResults[index];
        switch (key) {
          case 'docker':
            setDockerContainers(data);
            break;
          case 'services':
            setServices(data);
            break;
          case 'network':
            if (data) {
              setNetworkData(data);
              // Calculate network speed for MetricsPanel
              if (previousNetworkDataRef.current && previousNetworkTimeRef.current) {
                const currentTime = Date.now();
                const timeDiff = (currentTime - previousNetworkTimeRef.current) / 1000;
                const currentStats = data.stats[0];
                const prevStats = previousNetworkDataRef.current.stats[0];

                if (currentStats && prevStats && timeDiff > 0) {
                  const rxDiff = Math.max(0, currentStats.rx_bytes - prevStats.rx_bytes);
                  const txDiff = Math.max(0, currentStats.tx_bytes - prevStats.tx_bytes);
                  setNetworkStats({
                    downloadSpeed: rxDiff / timeDiff,
                    uploadSpeed: txDiff / timeDiff,
                  });
                }
              }
              previousNetworkDataRef.current = data;
              previousNetworkTimeRef.current = Date.now();
            }
            break;
          case 'disk':
            setDetailedDiskData(data);
            break;
          case 'processes':
            setProcessData(data);
            break;
        }
      });

      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, [collapsedPanels]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval, loadData]);

  const handleServicesUpdate = useCallback(() => {
    fetchServices().then(setServices);
  }, []);

  // Panel components mapping - memoized to prevent child remounts
  const panelComponents = useMemo(() => ({
    network: (
      <NetworkPanel
        key="network"
        data={networkData}
        isCollapsed={collapsedPanels.network}
        onCollapseChange={(collapsed) => handleCollapseChange('network', collapsed)}
      />
    ),
    disk: (
      <DiskPanel
        key="disk"
        data={detailedDiskData}
        isCollapsed={collapsedPanels.disk}
        onCollapseChange={(collapsed) => handleCollapseChange('disk', collapsed)}
      />
    ),
    docker: (
      <DockerPanel
        key="docker"
        containers={dockerContainers}
        isCollapsed={collapsedPanels.docker}
        onCollapseChange={(collapsed) => handleCollapseChange('docker', collapsed)}
      />
    ),
    services: (
      <ServicesPanel
        key="services"
        services={services}
        onUpdate={handleServicesUpdate}
        isCollapsed={collapsedPanels.services}
        onCollapseChange={(collapsed) => handleCollapseChange('services', collapsed)}
      />
    ),
    processes: (
      <ProcessPanel
        key="processes"
        data={processData}
        isCollapsed={collapsedPanels.processes}
        onCollapseChange={(collapsed) => handleCollapseChange('processes', collapsed)}
      />
    ),
  }), [
    networkData,
    detailedDiskData,
    dockerContainers,
    services,
    processData,
    collapsedPanels,
    handleServicesUpdate,
    handleCollapseChange,
  ]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-slate-400">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-end mb-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-400">Refresh Interval:</label>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="bg-slate-800 text-slate-100 border border-slate-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value={2000}>2 seconds</option>
              <option value={5000}>5 seconds</option>
              <option value={10000}>10 seconds</option>
              <option value={30000}>30 seconds</option>
              <option value={60000}>1 minute</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded mb-6">
            Error loading data: {error}
          </div>
        )}

        <MetricsPanel
          systemMetrics={systemMetrics}
          temperature={temperature}
          diskMetrics={diskMetrics}
          dockerInfo={dockerInfo}
          networkStats={networkStats}
        />

        {/* Draggable Panels */}
        <div className="mt-6 pl-0 md:pl-8">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={[...panelOrder.left, ...panelOrder.right]}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* Left Column */}
                <div className="flex flex-col gap-6">
                  {panelOrder.left.map((panelId) => (
                    <SortablePanel key={panelId} id={panelId}>
                      {panelComponents[panelId]}
                    </SortablePanel>
                  ))}
                </div>

                {/* Right Column */}
                <div className="flex flex-col gap-6">
                  {panelOrder.right.map((panelId) => (
                    <SortablePanel key={panelId} id={panelId}>
                      {panelComponents[panelId]}
                    </SortablePanel>
                  ))}
                </div>
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
