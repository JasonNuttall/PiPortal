import { Server } from "lucide-react";

const Header = () => {
  return (
    <header className="bg-slate-800 border-b border-slate-700">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center gap-3">
          <Server className="w-8 h-8 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold text-slate-100">
              Homelab Portal
            </h1>
            <p className="text-sm text-slate-400">Raspberry Pi Dashboard</p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
