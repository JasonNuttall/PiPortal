import { useState, useEffect } from "react";
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
} from "../api/api";

const Dashboard = () => {
  const [systemMetrics, setSystemMetrics] = useState(null);
  const [temperature, setTemperature] = useState(null);
  const [diskMetrics, setDiskMetrics] = useState(null);
  const [dockerContainers, setDockerContainers] = useState([]);
  const [dockerInfo, setDockerInfo] = useState(null);
  const [services, setServices] = useState([]);
  const [networkStats, setNetworkStats] = useState({
    downloadSpeed: 0,
    uploadSpeed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshInterval, setRefreshInterval] = useState(5000);

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

  // Handle drag end
  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setPanelOrder((panelOrder) => {
        // Determine which column each panel is in
        const activeColumn = panelOrder.left.includes(active.id) ? 'left' : 'right';
        const overColumn = panelOrder.left.includes(over.id) ? 'left' : 'right';

        // If moving within the same column
        if (activeColumn === overColumn) {
          const columnItems = [...panelOrder[activeColumn]];
          const oldIndex = columnItems.indexOf(active.id);
          const newIndex = columnItems.indexOf(over.id);
          const newColumnOrder = arrayMove(columnItems, oldIndex, newIndex);

          const newOrder = {
            ...panelOrder,
            [activeColumn]: newColumnOrder,
          };

          // Save to localStorage
          localStorage.setItem("panelOrder", JSON.stringify(newOrder));
          return newOrder;
        } else {
          // Moving between columns
          const sourceColumn = [...panelOrder[activeColumn]];
          const destColumn = [...panelOrder[overColumn]];

          // Remove from source column
          const itemIndex = sourceColumn.indexOf(active.id);
          sourceColumn.splice(itemIndex, 1);

          // Add to destination column at the position of the over item
          const overIndex = destColumn.indexOf(over.id);
          destColumn.splice(overIndex, 0, active.id);

          const newOrder = {
            left: activeColumn === 'left' ? sourceColumn : destColumn,
            right: activeColumn === 'right' ? sourceColumn : destColumn,
          };

          // Save to localStorage
          localStorage.setItem("panelOrder", JSON.stringify(newOrder));
          return newOrder;
        }
      });
    }
  };

  // Track network speeds for metrics
  let previousNetworkData = null;
  let previousNetworkTime = null;

  const loadNetworkSpeed = async () => {
    try {
      const data = await fetchNetworkMetrics();

      if (previousNetworkData && previousNetworkTime) {
        const currentTime = Date.now();
        const timeDiff = (currentTime - previousNetworkTime) / 1000;

        // Get default interface stats
        const currentStats = data.stats[0];
        const prevStats = previousNetworkData.stats[0];

        if (currentStats && prevStats && timeDiff > 0) {
          const rxDiff = Math.max(
            0,
            currentStats.rx_bytes - prevStats.rx_bytes
          );
          const txDiff = Math.max(
            0,
            currentStats.tx_bytes - prevStats.tx_bytes
          );

          setNetworkStats({
            downloadSpeed: rxDiff / timeDiff,
            uploadSpeed: txDiff / timeDiff,
          });
        }
      }

      previousNetworkData = data;
      previousNetworkTime = Date.now();
    } catch (err) {
      console.error("Error fetching network speed:", err);
    }
  };

  const loadData = async () => {
    try {
      setError(null);
      const [system, temp, disk, containers, dockerInf, svcs] =
        await Promise.all([
          fetchSystemMetrics().catch((err) => ({ error: err.message })),
          fetchTemperature().catch((err) => ({ error: err.message })),
          fetchDiskMetrics().catch((err) => ({ error: err.message })),
          fetchDockerContainers().catch((err) => []),
          fetchDockerInfo().catch((err) => ({ error: err.message })),
          fetchServices().catch((err) => []),
        ]);

      setSystemMetrics(system);
      setTemperature(temp);
      setDiskMetrics(disk);
      setDockerContainers(containers);
      setDockerInfo(dockerInf);
      setServices(svcs);

      // Also load network speed
      loadNetworkSpeed();

      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  const handleServicesUpdate = () => {
    fetchServices().then(setServices);
  };

  // Panel components mapping
  const panelComponents = {
    network: <NetworkPanel key="network" refreshInterval={refreshInterval} />,
    disk: <DiskPanel key="disk" refreshInterval={refreshInterval} />,
    docker: <DockerPanel key="docker" containers={dockerContainers} />,
    services: (
      <ServicesPanel
        key="services"
        services={services}
        onUpdate={handleServicesUpdate}
      />
    ),
    processes: (
      <ProcessPanel key="processes" refreshInterval={refreshInterval} />
    ),
  };

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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
