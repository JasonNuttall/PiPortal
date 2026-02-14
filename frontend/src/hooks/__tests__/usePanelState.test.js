import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePanelState } from "../usePanelState";

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

describe("usePanelState", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("returns default collapsed state when no localStorage", () => {
      const { result } = renderHook(() => usePanelState());
      expect(result.current.collapsedPanels).toEqual({});
    });

    it("returns default panel modes when no localStorage", () => {
      const { result } = renderHook(() => usePanelState());
      expect(result.current.panelModes).toEqual({
        network: "polling",
        disk: "polling",
        docker: "polling",
        services: "polling",
        processes: "polling",
      });
    });

    it("returns default panel order when no localStorage", () => {
      const { result } = renderHook(() => usePanelState());
      expect(result.current.panelOrder).toEqual({
        left: ["services", "network"],
        right: ["disk", "processes", "docker"],
      });
    });

    it("returns default hidden partitions when no localStorage", () => {
      const { result } = renderHook(() => usePanelState());
      expect(result.current.hiddenPartitions).toEqual([]);
    });

    it("restores collapsed state from localStorage", () => {
      localStorageMock.getItem.mockReturnValueOnce(
        JSON.stringify({ network: true, disk: false })
      );

      const { result } = renderHook(() => usePanelState());
      expect(result.current.collapsedPanels).toEqual({ network: true, disk: false });
    });

    it("restores panel modes from localStorage", () => {
      localStorageMock.getItem
        .mockReturnValueOnce(null) // collapsedPanels
        .mockReturnValueOnce(
          JSON.stringify({ network: "websocket", disk: "polling" })
        );

      const { result } = renderHook(() => usePanelState());
      expect(result.current.panelModes.network).toBe("websocket");
    });
  });

  describe("handleCollapseChange", () => {
    it("updates collapsed state for a panel", () => {
      const { result } = renderHook(() => usePanelState());

      act(() => {
        result.current.handleCollapseChange("network", true);
      });

      expect(result.current.collapsedPanels.network).toBe(true);
    });

    it("persists collapsed state to localStorage", () => {
      const { result } = renderHook(() => usePanelState());

      act(() => {
        result.current.handleCollapseChange("docker", true);
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "collapsedPanels",
        expect.stringContaining('"docker":true')
      );
    });

    it("can toggle panel back to expanded", () => {
      const { result } = renderHook(() => usePanelState());

      act(() => {
        result.current.handleCollapseChange("disk", true);
      });
      expect(result.current.collapsedPanels.disk).toBe(true);

      act(() => {
        result.current.handleCollapseChange("disk", false);
      });
      expect(result.current.collapsedPanels.disk).toBe(false);
    });
  });

  describe("handleModeChange", () => {
    it("updates panel mode", () => {
      const { result } = renderHook(() => usePanelState());

      act(() => {
        result.current.handleModeChange("network", "websocket");
      });

      expect(result.current.panelModes.network).toBe("websocket");
    });

    it("persists mode to localStorage", () => {
      const { result } = renderHook(() => usePanelState());

      act(() => {
        result.current.handleModeChange("disk", "websocket");
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "panelModes",
        expect.stringContaining('"disk":"websocket"')
      );
    });

    it("preserves other panel modes when changing one", () => {
      const { result } = renderHook(() => usePanelState());

      act(() => {
        result.current.handleModeChange("network", "websocket");
      });

      expect(result.current.panelModes.disk).toBe("polling");
      expect(result.current.panelModes.docker).toBe("polling");
    });
  });

  describe("handleHiddenPartitionsChange", () => {
    it("updates hidden partitions", () => {
      const { result } = renderHook(() => usePanelState());

      act(() => {
        result.current.handleHiddenPartitionsChange(["/boot/firmware", "/tmp"]);
      });

      expect(result.current.hiddenPartitions).toEqual(["/boot/firmware", "/tmp"]);
    });

    it("persists hidden partitions to localStorage", () => {
      const { result } = renderHook(() => usePanelState());

      act(() => {
        result.current.handleHiddenPartitionsChange(["/boot"]);
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "hiddenPartitions",
        JSON.stringify(["/boot"])
      );
    });
  });

  describe("setPanelOrder", () => {
    it("provides setPanelOrder as a function", () => {
      const { result } = renderHook(() => usePanelState());
      expect(typeof result.current.setPanelOrder).toBe("function");
    });

    it("updates panel order", () => {
      const { result } = renderHook(() => usePanelState());

      act(() => {
        result.current.setPanelOrder({
          left: ["network", "services"],
          right: ["docker", "disk", "processes"],
        });
      });

      expect(result.current.panelOrder.left).toEqual(["network", "services"]);
    });
  });
});
