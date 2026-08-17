import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { formatAge, useRelativeTime } from "../useRelativeTime";

afterEach(() => vi.useRealTimers());

describe("formatAge", () => {
  const now = 1_000_000_000_000;

  it.each([
    [0, "just now"],
    [3_000, "just now"],
    [12_000, "12s ago"],
    [90_000, "1m ago"],
    [3_600_000, "1h ago"],
    [90_000_000, "1d ago"],
  ])("renders %ims as %s", (elapsed, expected) => {
    expect(formatAge(now - elapsed, now)).toBe(expected);
  });

  it("returns null without a timestamp", () => {
    expect(formatAge(null)).toBeNull();
  });

  it("never reports a negative age from clock skew", () => {
    expect(formatAge(now + 5000, now)).toBe("just now");
  });
});

describe("useRelativeTime", () => {
  it("runs no timer when inactive, so healthy panels do not re-render", () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, "setInterval");

    renderHook(() => useRelativeTime(Date.now(), false));

    expect(spy).not.toHaveBeenCalled();
  });

  it("runs a timer when active", () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, "setInterval");

    renderHook(() => useRelativeTime(Date.now(), true));

    expect(spy).toHaveBeenCalled();
  });

  it("returns null when there is no timestamp", () => {
    const { result } = renderHook(() => useRelativeTime(null, true));
    expect(result.current).toBeNull();
  });
});
