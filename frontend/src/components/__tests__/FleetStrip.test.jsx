import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import FleetStrip from "../FleetStrip";

const nodes = [
  {
    id: "pi5",
    name: "Raspberry Pi 5",
    isLocal: true,
    status: "online",
    summary: {
      cpuLoad: 12.4,
      memoryUsedPercentage: 48,
      temperature: 47.2,
      diskUsedPercentage: 71,
      containersRunning: 6,
      containersTotal: 8,
      uptime: 90000,
    },
  },
  {
    id: "jelly",
    name: "Jelly",
    isLocal: false,
    status: "online",
    summary: {
      cpuLoad: 63,
      memoryUsedPercentage: 72,
      temperature: 56.5,
      diskUsedPercentage: 38,
      containersRunning: 11,
      containersTotal: 11,
      uptime: 3600,
    },
  },
];

const renderStrip = (props = {}) =>
  render(
    <FleetStrip
      nodes={nodes}
      selectedId="pi5"
      onSelect={vi.fn()}
      onManage={vi.fn()}
      {...props}
    />
  );

describe("FleetStrip", () => {
  it("shows every node at once", () => {
    renderStrip();
    expect(screen.getByText("Raspberry Pi 5")).toBeInTheDocument();
    expect(screen.getByText("Jelly")).toBeInTheDocument();
  });

  it("marks the hub's own machine", () => {
    renderStrip();
    expect(screen.getByText("Hub")).toBeInTheDocument();
  });

  it("rounds the headline figures", () => {
    renderStrip();
    expect(screen.getByText("12")).toBeInTheDocument(); // 12.4 CPU
    expect(screen.getByText("47")).toBeInTheDocument(); // 47.2 temp
  });

  it("marks the selected node with aria-pressed", () => {
    renderStrip();
    const selected = screen.getByRole("button", { pressed: true });
    expect(within(selected).getByText("Raspberry Pi 5")).toBeInTheDocument();
  });

  it("selects a node when its card is clicked", () => {
    const onSelect = vi.fn();
    renderStrip({ onSelect });

    fireEvent.click(screen.getByText("Jelly"));
    expect(onSelect).toHaveBeenCalledWith("jelly");
  });

  it("shows container counts and uptime", () => {
    renderStrip();
    expect(screen.getByText("6/8 containers")).toBeInTheDocument();
    expect(screen.getByText("1d 1h up")).toBeInTheDocument();
  });

  it("reports an unreachable node instead of stale figures", () => {
    render(
      <FleetStrip
        nodes={[
          {
            id: "jelly",
            name: "Jelly",
            status: "offline",
            error: "ECONNREFUSED",
            summary: null,
          },
        ]}
        selectedId="jelly"
        onSelect={vi.fn()}
        onManage={vi.fn()}
      />
    );

    expect(screen.getByText(/Unreachable — ECONNREFUSED/)).toBeInTheDocument();
  });

  it("renders placeholders when a node has not reported yet", () => {
    render(
      <FleetStrip
        nodes={[{ id: "new", name: "New", status: "connecting", summary: null }]}
        selectedId="new"
        onSelect={vi.fn()}
        onManage={vi.fn()}
      />
    );

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("opens node management", () => {
    const onManage = vi.fn();
    renderStrip({ onManage });

    fireEvent.click(screen.getByText("Manage nodes"));
    expect(onManage).toHaveBeenCalled();
  });

  it("handles an empty fleet", () => {
    renderStrip({ nodes: [] });
    expect(screen.getByText("No nodes registered.")).toBeInTheDocument();
  });
});
