const formatUptime = (seconds) => {
  if (!seconds) return null;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h up`;
  if (hours > 0) return `${hours}h up`;
  return `${Math.floor(seconds / 60)}m up`;
};

const Header = ({ systemMetrics, dockerInfo, diskMetrics }) => {
  const hostname =
    typeof window !== "undefined" ? window.location.hostname : "homelab";
  const containerCount = dockerInfo?.containersRunning ?? null;
  const storagePercent = diskMetrics?.usedPercentage ?? null;
  const uptime = systemMetrics?.uptime
    ? formatUptime(systemMetrics.uptime)
    : null;

  return (
    <header
      className="relative z-10 border-b border-glass-border"
      style={{ backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
    >
      <div className="px-4 sm:px-8 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        {/* Left: logo + title */}
        <div className="flex items-center gap-3">
          <img
            src="/assets/pi-logo.png"
            alt="Raspberry Pi"
            className="w-10 h-10 sm:w-12 sm:h-12"
          />
          <div>
            <div className="text-[9px] tracking-[5px] text-crystal-blue uppercase opacity-70 mb-1">
              Crystal Cavern — Private Cloud
            </div>
            <h1 className="font-spectral italic font-medium text-3xl sm:text-[40px] leading-none tracking-wide crystal-gradient-text">
              Homelab
            </h1>
          </div>
        </div>

        {/* Right: status pills */}
        <div className="flex gap-2 flex-wrap">
          {hostname && (
            <div className="glass-pill">
              <span className="status-dot status-dot-blue" />
              <span className="text-ctext-mid">{hostname}</span>
            </div>
          )}
          {containerCount !== null && (
            <div className="glass-pill">
              <span className="status-dot status-dot-blue" />
              <span className="text-ctext-mid">
                {containerCount} container{containerCount !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          {storagePercent !== null && (
            <div className="glass-pill">
              <span className="status-dot status-dot-teal" />
              <span className="text-ctext-mid">
                Storage {Math.round(storagePercent)}%
              </span>
            </div>
          )}
          {uptime && (
            <div className="glass-pill">
              <span className="status-dot status-dot-white" />
              <span className="text-ctext-mid">{uptime}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
