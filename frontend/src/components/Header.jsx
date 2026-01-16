const Header = () => {
  return (
    <header className="bg-slate-800 border-b border-slate-700">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center gap-3">
          {/* Raspberry Pi Logo */}
          <img
            src="/assets/pi-logo.png"
            alt="Raspberry Pi"
            className="w-12 h-12"
          />
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
