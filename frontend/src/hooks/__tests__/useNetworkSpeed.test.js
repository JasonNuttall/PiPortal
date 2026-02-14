import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useNetworkSpeed } from "../useNetworkSpeed";

describe("useNetworkSpeed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null on first data point (no previous data)", () => {
    const { result } = renderHook(() => useNetworkSpeed());

    const speeds = result.current.calculateSpeed({
      stats: [{ rx_bytes: 1000, tx_bytes: 500 }],
    });

    expect(speeds).toBeNull();
  });

  it("calculates download and upload speeds on second data point", () => {
    const { result } = renderHook(() => useNetworkSpeed());

    // First data point at t=0
    result.current.calculateSpeed({
      stats: [{ rx_bytes: 1000, tx_bytes: 500 }],
    });

    // Advance time by 1 second
    vi.advanceTimersByTime(1000);

    // Second data point
    const speeds = result.current.calculateSpeed({
      stats: [{ rx_bytes: 2000, tx_bytes: 1500 }],
    });

    expect(speeds).not.toBeNull();
    expect(speeds.downloadSpeed).toBe(1000); // 1000 bytes / 1 sec
    expect(speeds.uploadSpeed).toBe(1000);   // 1000 bytes / 1 sec
  });

  it("handles varying time intervals", () => {
    const { result } = renderHook(() => useNetworkSpeed());

    result.current.calculateSpeed({
      stats: [{ rx_bytes: 0, tx_bytes: 0 }],
    });

    // Advance time by 2 seconds
    vi.advanceTimersByTime(2000);

    const speeds = result.current.calculateSpeed({
      stats: [{ rx_bytes: 10000, tx_bytes: 4000 }],
    });

    expect(speeds.downloadSpeed).toBe(5000); // 10000 bytes / 2 sec
    expect(speeds.uploadSpeed).toBe(2000);   // 4000 bytes / 2 sec
  });

  it("returns 0 speed when bytes don't change", () => {
    const { result } = renderHook(() => useNetworkSpeed());

    result.current.calculateSpeed({
      stats: [{ rx_bytes: 5000, tx_bytes: 3000 }],
    });

    vi.advanceTimersByTime(1000);

    const speeds = result.current.calculateSpeed({
      stats: [{ rx_bytes: 5000, tx_bytes: 3000 }],
    });

    expect(speeds.downloadSpeed).toBe(0);
    expect(speeds.uploadSpeed).toBe(0);
  });

  it("clamps negative diffs to 0 (counter reset)", () => {
    const { result } = renderHook(() => useNetworkSpeed());

    result.current.calculateSpeed({
      stats: [{ rx_bytes: 10000, tx_bytes: 5000 }],
    });

    vi.advanceTimersByTime(1000);

    // Simulate counter reset (bytes go down)
    const speeds = result.current.calculateSpeed({
      stats: [{ rx_bytes: 100, tx_bytes: 50 }],
    });

    expect(speeds.downloadSpeed).toBe(0);
    expect(speeds.uploadSpeed).toBe(0);
  });

  it("handles missing stats array gracefully", () => {
    const { result } = renderHook(() => useNetworkSpeed());

    result.current.calculateSpeed({ stats: [{ rx_bytes: 100, tx_bytes: 50 }] });

    vi.advanceTimersByTime(1000);

    // Empty stats
    const speeds = result.current.calculateSpeed({ stats: [] });

    // Should return null because currentStats is undefined
    expect(speeds).toBeNull();
  });

  it("tracks multiple sequential data points correctly", () => {
    const { result } = renderHook(() => useNetworkSpeed());

    // Point 1
    result.current.calculateSpeed({
      stats: [{ rx_bytes: 0, tx_bytes: 0 }],
    });
    vi.advanceTimersByTime(1000);

    // Point 2
    result.current.calculateSpeed({
      stats: [{ rx_bytes: 1000, tx_bytes: 500 }],
    });
    vi.advanceTimersByTime(1000);

    // Point 3 — speed should be calculated from point 2 to point 3
    const speeds = result.current.calculateSpeed({
      stats: [{ rx_bytes: 3000, tx_bytes: 1500 }],
    });

    expect(speeds.downloadSpeed).toBe(2000); // 3000-1000 / 1 sec
    expect(speeds.uploadSpeed).toBe(1000);   // 1500-500 / 1 sec
  });
});
