import { useState, useEffect, useMemo, useCallback } from "react";
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
import ErrorBoundary from "./ErrorBoundary";
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
import { useWebSocket } from "../hooks/useWebSocket";
import { usePanelState } from "../hooks/usePanelState";
import { useWebSocketSubscriptions } from "../hooks/useWebSocketSubscriptions";
import { useNetworkSpeed } from "../hooks/useNetworkSpeed";
import { PANEL_TO_CHANNEL } from "../hooks/usePanelData";

const Dashboard = () => {
  const { isConnected: wsConnected, subscribe } = useWebSocket();

  // Panel state management (extracted hook)
  const {
    collapsedPanels,
    panelModes,
    hiddenPartitions,
    panelOrder,
    setPanelOrder,
    handleCollapseChange,
    handleModeChange,
    handleHiddenPartitionsChange,
  } = usePanelState();

  // Network speed calculation (extracted hook)
  const { calculateSpeed } = useNetworkSpeed();

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

  // WebSocket subscriptions (extracted hook)
  useWebSocketSubscriptions({
    wsConnected,
    subscribe,
    panelModes,
    collapsedPanels,
    setNetworkData,
    setDetailedDiskData,
    setDockerContainers,
    setServices,
    setProcessData,
    setNetworkStats,
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
    }),
  );

  // Handle drag end
  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setPanelOrder((panelOrder) => {
        const activeColumn = panelOrder.left.includes(active.id)
          ? "left"
          : "right";
        const overColumn = panelOrder.left.includes(over.id) ? "left" : "right";

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
            left: activeColumn === "left" ? sourceColumn : destColumn,
            right: activeColumn === "right" ? sourceColumn : destColumn,
          };

          localStorage.setItem("panelOrder", JSON.stringify(newOrder));
          return newOrder;
        }
      });
    }
  }, [setPanelOrder]);

  // Centralized data loading - only fetches data for expanded panels
  const loadData = useCallback(async () => {
    try {
      setError(null);

      const corePromises = [
        fetchSystemMetrics().catch((err) => ({ error: err.message })),
        fetchTemperature().catch((err) => ({ error: err.message })),
        fetchDiskMetrics().catch((err) => ({ error: err.message })),
        fetchDockerInfo().catch((err) => ({ error: err.message })),
      ];

      const panelPromises = [];
      const panelKeys = [];

      const shouldPoll = (panelId) =>
        !collapsedPanels[panelId] && panelModes[panelId] !== "websocket";

      if (shouldPoll("docker")) {
        panelPromises.push(fetchDockerContainers().catch(() => []));
        panelKeys.push("docker");
      }

      if (shouldPoll("services")) {
        panelPromises.push(fetchServices().catch(() => []));
        panelKeys.push("services");
      }

      if (shouldPoll("network")) {
        panelPromises.push(fetchNetworkMetrics().catch(() => null));
        panelKeys.push("network");
      }

      if (shouldPoll("disk")) {
        panelPromises.push(fetchDetailedDiskInfo().catch(() => null));
        panelKeys.push("disk");
      }

      if (shouldPoll("processes")) {
        panelPromises.push(fetchProcesses().catch(() => null));
        panelKeys.push("processes");
      }

      const [coreResults, panelResults] = await Promise.all([
        Promise.all(corePromises),
        Promise.all(panelPromises),
      ]);

      const [system, temp, disk, dockerInf] = coreResults;
      setSystemMetrics(system);
      setTemperature(temp);
      setDiskMetrics(disk);
      setDockerInfo(dockerInf);

      panelKeys.forEach((key, index) => {
        const data = panelResults[index];
        switch (key) {
          case "docker":
            setDockerContainers(data);
            break;
          case "services":
            setServices(data);
            break;
          case "network":
            if (data) {
              setNetworkData(data);
              const speeds = calculateSpeed(data);
              if (speeds) setNetworkStats(speeds);
            }
            break;
          case "disk":
            setDetailedDiskData(data);
            break;
          case "processes":
            setProcessData(data);
            break;
        }
      });

      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, [collapsedPanels, panelModes, calculateSpeed]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval, loadData]);

  const handleServicesUpdate = useCallback(() => {
    fetchServices().then(setServices);
  }, []);

  // Panel components mapping
  const panelComponents = useMemo(
    () => ({
      network: (
        <ErrorBoundary panelName="Network">
          <NetworkPanel
            key="network"
            data={networkData}
            isCollapsed={collapsedPanels.network}
            onCollapseChange={(collapsed) =>
              handleCollapseChange("network", collapsed)
            }
            panelId="network"
            dataMode={panelModes.network}
            onModeChange={(mode) => handleModeChange("network", mode)}
            wsConnected={wsConnected}
          />
        </ErrorBoundary>
      ),
      disk: (
        <ErrorBoundary panelName="Disk">
          <DiskPanel
            key="disk"
            data={detailedDiskData}
            isCollapsed={collapsedPanels.disk}
            onCollapseChange={(collapsed) =>
              handleCollapseChange("disk", collapsed)
            }
            panelId="disk"
            dataMode={panelModes.disk}
            onModeChange={(mode) => handleModeChange("disk", mode)}
            wsConnected={wsConnected}
            hiddenPartitions={hiddenPartitions}
            onHiddenPartitionsChange={handleHiddenPartitionsChange}
          />
        </ErrorBoundary>
      ),
      docker: (
        <ErrorBoundary panelName="Docker">
          <DockerPanel
            key="docker"
            containers={dockerContainers}
            isCollapsed={collapsedPanels.docker}
            onCollapseChange={(collapsed) =>
              handleCollapseChange("docker", collapsed)
            }
            panelId="docker"
            dataMode={panelModes.docker}
            onModeChange={(mode) => handleModeChange("docker", mode)}
            wsConnected={wsConnected}
          />
        </ErrorBoundary>
      ),
      services: (
        <ErrorBoundary panelName="Services">
          <ServicesPanel
            key="services"
            services={services}
            onUpdate={handleServicesUpdate}
            isCollapsed={collapsedPanels.services}
            onCollapseChange={(collapsed) =>
              handleCollapseChange("services", collapsed)
            }
            panelId="services"
            dataMode={panelModes.services}
            onModeChange={(mode) => handleModeChange("services", mode)}
            wsConnected={wsConnected}
          />
        </ErrorBoundary>
      ),
      processes: (
        <ErrorBoundary panelName="Processes">
          <ProcessPanel
            key="processes"
            data={processData}
            isCollapsed={collapsedPanels.processes}
            onCollapseChange={(collapsed) =>
              handleCollapseChange("processes", collapsed)
            }
            panelId="processes"
            dataMode={panelModes.processes}
            onModeChange={(mode) => handleModeChange("processes", mode)}
            wsConnected={wsConnected}
          />
        </ErrorBoundary>
      ),
    }),
    [
      networkData,
      detailedDiskData,
      dockerContainers,
      services,
      processData,
      collapsedPanels,
      panelModes,
      wsConnected,
      hiddenPartitions,
      handleServicesUpdate,
      handleCollapseChange,
      handleModeChange,
      handleHiddenPartitionsChange,
    ],
  );

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
