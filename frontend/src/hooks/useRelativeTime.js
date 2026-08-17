import { useState, useEffect } from "react";

const TICK_MS = 10000;

/** "just now", "12s ago", "4m ago", "2h ago" */
export const formatAge = (timestamp, now = Date.now()) => {
  if (!timestamp) return null;
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

/**
 * A human-readable age that refreshes itself.
 *
 * `active` gates the timer deliberately: ages are only shown when a panel is
 * not receiving live data, so a healthy dashboard runs no extra interval and
 * re-renders no extra times.
 */
export function useRelativeTime(timestamp, active = true) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || !timestamp) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [active, timestamp]);

  return formatAge(timestamp, now);
}

export default useRelativeTime;
