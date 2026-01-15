import { useState, useEffect } from "react";
import Header from "./Header";
import MetricsPanel from "./MetricsPanel";
import DockerPanel from "./DockerPanel";
import ServicesPanel from "./ServicesPanel";
import {
  fetchSystemMetrics,
  fetchTemperature,
  fetchDiskMetrics,
  fetchDockerContainers,
  fetchDockerInfo,
  fetchServices,
} from "../api/api";

const Dashboard = () => {
  const [systemMetrics, setSystemMetrics] = useState(null);
  const [temperature, setTemperature] = useState(null);
  const [diskMetrics, setDiskMetrics] = useState(null);
  const [dockerContainers, setDockerContainers] = useState([]);
  const [dockerInfo, setDockerInfo] = useState(null);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const handleServicesUpdate = () => {
    fetchServices().then(setServices);
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
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <DockerPanel containers={dockerContainers} />
          <ServicesPanel services={services} onUpdate={handleServicesUpdate} />
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
