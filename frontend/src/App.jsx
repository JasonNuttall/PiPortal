import Dashboard from "./components/Dashboard";
import CrystalBackground from "./components/CrystalBackground";
import "./App.css";

function App() {
  return (
    <div className="min-h-screen bg-crystal-void">
      <CrystalBackground />
      <div className="relative z-10">
        <Dashboard />
      </div>
    </div>
  );
}

export default App;
