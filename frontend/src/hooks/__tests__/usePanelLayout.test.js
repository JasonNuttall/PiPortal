import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  usePanelLayout,
  migrateLegacyOrder,
  reconcileLayout,
} from "../usePanelLayout";

const panels = [
  { id: "services", defaultSize: "compact" },
  { id: "network", defaultSize: "compact" },
  { id: "disk", defaultSize: "wide" },
  { id: "processes", defaultSize: "wide" },
  { id: "docker", defaultSize: "compact" },
];

beforeEach(() => localStorage.clear());

describe("migrateLegacyOrder", () => {
  it("interleaves the two columns to preserve reading order", () => {
    // Down two columns you read left[0], right[0], left[1], right[1]…
    const merged = migrateLegacyOrder({
      left: ["services", "network"],
      right: ["disk", "processes", "docker"],
    });

    expect(merged.map((entry) => entry.id)).toEqual([
      "services",
      "disk",
      "network",
      "processes",
      "docker",
    ]);
  });

  it("handles columns of unequal length", () => {
    const merged = migrateLegacyOrder({ left: ["a"], right: ["b", "c", "d"] });
    expect(merged.map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("handles an empty column", () => {
    const merged = migrateLegacyOrder({ left: [], right: ["a", "b"] });
    expect(merged.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("returns null for anything that is not the old shape", () => {
    expect(migrateLegacyOrder(null)).toBeNull();
    expect(migrateLegacyOrder({})).toBeNull();
    expect(migrateLegacyOrder([{ id: "a" }])).toBeNull();
  });
});

describe("reconcileLayout", () => {
  it("gives every panel its default size on a first run", () => {
    const layout = reconcileLayout(null, panels);
    expect(layout).toHaveLength(5);
    expect(layout.find((e) => e.id === "disk").size).toBe("wide");
    expect(layout.find((e) => e.id === "network").size).toBe("compact");
  });

  it("keeps the saved order and sizes", () => {
    const layout = reconcileLayout(
      [
        { id: "docker", size: "full" },
        { id: "disk", size: "compact" },
      ],
      panels
    );

    expect(layout.slice(0, 2)).toEqual([
      { id: "docker", size: "full" },
      { id: "disk", size: "compact" },
    ]);
  });

  it("appends panels that did not exist when the layout was saved", () => {
    // This is what happens the moment a module is registered.
    const layout = reconcileLayout([{ id: "docker", size: "compact" }], panels);

    expect(layout[0].id).toBe("docker");
    expect(layout.map((e) => e.id)).toContain("services");
    expect(layout).toHaveLength(5);
  });

  it("drops panels that no longer exist", () => {
    const layout = reconcileLayout(
      [{ id: "removed-module", size: "wide" }, { id: "disk", size: "wide" }],
      panels
    );

    expect(layout.map((e) => e.id)).not.toContain("removed-module");
    expect(layout).toHaveLength(5);
  });

  it("drops duplicates rather than rendering a panel twice", () => {
    const layout = reconcileLayout(
      [{ id: "disk", size: "wide" }, { id: "disk", size: "compact" }],
      panels
    );

    expect(layout.filter((e) => e.id === "disk")).toHaveLength(1);
  });

  it("repairs an invalid size", () => {
    const layout = reconcileLayout([{ id: "disk", size: "enormous" }], panels);
    expect(layout.find((e) => e.id === "disk").size).toBe("wide");
  });

  it("survives a malformed entry", () => {
    const layout = reconcileLayout([null, undefined, { id: "disk" }], panels);
    expect(layout.find((e) => e.id === "disk")).toBeDefined();
  });
});

describe("usePanelLayout", () => {
  it("starts from panel defaults", () => {
    const { result } = renderHook(() => usePanelLayout("pi5", panels));
    expect(result.current.layout).toHaveLength(5);
  });

  it("adopts a pre-multi-node saved layout on first run", () => {
    localStorage.setItem(
      "panelOrder",
      JSON.stringify({ left: ["services"], right: ["disk"] })
    );

    const { result } = renderHook(() => usePanelLayout("pi5", panels));
    expect(result.current.layout.slice(0, 2).map((e) => e.id)).toEqual([
      "services",
      "disk",
    ]);
  });

  it("reorders on move and persists", () => {
    const { result } = renderHook(() => usePanelLayout("pi5", panels));
    const [first, second] = result.current.layout.map((e) => e.id);

    act(() => result.current.move(second, first));

    expect(result.current.layout[0].id).toBe(second);
    expect(localStorage.getItem("panelLayout:pi5")).toContain(second);
  });

  it("ignores a move onto an unknown panel", () => {
    const { result } = renderHook(() => usePanelLayout("pi5", panels));
    const before = result.current.layout.map((e) => e.id);

    act(() => result.current.move("disk", "does-not-exist"));

    expect(result.current.layout.map((e) => e.id)).toEqual(before);
  });

  it("cycles a panel through every width and back", () => {
    const { result } = renderHook(() => usePanelLayout("pi5", panels));
    const sizeOf = () => result.current.layout.find((e) => e.id === "network").size;

    expect(sizeOf()).toBe("compact");
    act(() => result.current.cycleSize("network"));
    expect(sizeOf()).toBe("wide");
    act(() => result.current.cycleSize("network"));
    expect(sizeOf()).toBe("full");
    act(() => result.current.cycleSize("network"));
    // banner claims the whole row, whatever the column count happens to be.
    expect(sizeOf()).toBe("banner");
    act(() => result.current.cycleSize("network"));
    expect(sizeOf()).toBe("compact");
  });

  it("accepts banner as a saved size", () => {
    const layout = reconcileLayout([{ id: "disk", size: "banner" }], panels);
    expect(layout.find((e) => e.id === "disk").size).toBe("banner");
  });

  it("keeps a separate layout per node", () => {
    const pi = renderHook(() => usePanelLayout("pi5", panels));
    act(() => pi.result.current.cycleSize("network"));

    const jelly = renderHook(() => usePanelLayout("jelly", panels));

    expect(
      jelly.result.current.layout.find((e) => e.id === "network").size
    ).toBe("compact");
    expect(localStorage.getItem("panelLayout:pi5")).toBeTruthy();
  });

  it("recovers from a corrupt saved layout", () => {
    localStorage.setItem("panelLayout:pi5", "{not json");
    const { result } = renderHook(() => usePanelLayout("pi5", panels));
    expect(result.current.layout).toHaveLength(5);
  });
});
