import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { spanFor, useRowSpan, ROW_HEIGHT, ROW_GAP } from "../useRowSpan";

describe("spanFor", () => {
  it("reserves the content plus one gap", () => {
    // 56px of header + 24px gap = 80px = 10 rows of 8px.
    expect(spanFor(56)).toBe(10);
  });

  it("rounds up to whole rows", () => {
    expect(spanFor(57)).toBe(11);
  });

  it("scales with content", () => {
    expect(spanFor(820)).toBe(Math.ceil((820 + ROW_GAP) / ROW_HEIGHT));
  });

  it("never returns less than one row", () => {
    expect(spanFor(0)).toBeGreaterThanOrEqual(1);
    expect(spanFor(-10)).toBeGreaterThanOrEqual(1);
  });

  it("gives a collapsed panel far fewer rows than an expanded one", () => {
    // This ratio is the whole point: collapsing must actually free space.
    expect(spanFor(56)).toBeLessThan(spanFor(820) / 5);
  });
});

describe("useRowSpan", () => {
  it("starts unmeasured", () => {
    const { result } = renderHook(() => useRowSpan());
    // jsdom reports zero-height elements, so nothing is measured.
    expect(result.current.measured).toBe(false);
    expect(result.current.span).toBe(1);
  });

  it("exposes a ref to attach to the measured element", () => {
    const { result } = renderHook(() => useRowSpan());
    expect(result.current).toHaveProperty("ref");
  });

  it("survives an environment with no ResizeObserver", () => {
    const original = globalThis.ResizeObserver;
    delete globalThis.ResizeObserver;
    expect(() => renderHook(() => useRowSpan())).not.toThrow();
    globalThis.ResizeObserver = original;
  });
});
