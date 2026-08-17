import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSelectedNode } from "../useSelectedNode";

const nodes = [
  { id: "pi5", name: "Raspberry Pi 5", isLocal: true },
  { id: "jelly", name: "Jelly", isLocal: false },
];

beforeEach(() => {
  localStorage.clear();
});

describe("useSelectedNode", () => {
  it("defaults to the hub's own machine", () => {
    const { result } = renderHook(() => useSelectedNode(nodes));
    expect(result.current.selectedId).toBe("pi5");
  });

  it("restores the remembered node", () => {
    localStorage.setItem("selectedNodeId", "jelly");
    const { result } = renderHook(() => useSelectedNode(nodes));
    expect(result.current.selectedId).toBe("jelly");
  });

  it("remembers a new choice", () => {
    const { result } = renderHook(() => useSelectedNode(nodes));
    act(() => result.current.selectNode("jelly"));

    expect(result.current.selectedId).toBe("jelly");
    expect(localStorage.getItem("selectedNodeId")).toBe("jelly");
  });

  it("falls back when the remembered node has been removed", () => {
    localStorage.setItem("selectedNodeId", "deleted-node");
    const { result } = renderHook(() => useSelectedNode(nodes));

    expect(result.current.selectedId).toBe("pi5");
    expect(localStorage.getItem("selectedNodeId")).toBe("pi5");
  });

  it("falls back to the first node when none is local", () => {
    localStorage.setItem("selectedNodeId", "gone");
    const remoteOnly = [
      { id: "a", name: "A", isLocal: false },
      { id: "b", name: "B", isLocal: false },
    ];
    const { result } = renderHook(() => useSelectedNode(remoteOnly));

    expect(result.current.selectedId).toBe("a");
  });

  it("exposes the resolved node object", () => {
    const { result } = renderHook(() => useSelectedNode(nodes));
    expect(result.current.selectedNode).toMatchObject({ name: "Raspberry Pi 5" });
  });

  it("stays null until the fleet has loaded", () => {
    const { result } = renderHook(() => useSelectedNode([]));
    expect(result.current.selectedNode).toBeNull();
  });
});
