import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Activity } from "lucide-react";
import BasePanel from "../BasePanel";

// Regression cover for the state a panel showed when its node was unreachable:
// "Loading..." forever, indistinguishable from a panel that was still starting.
const renderPanel = (props = {}) =>
  render(
    <BasePanel title="Disk" icon={Activity} {...props}>
      {(data) => <div>rows: {data.length}</div>}
    </BasePanel>
  );

describe("BasePanel connection states", () => {
  it("shows loading before any data arrives", () => {
    renderPanel({ data: null, connection: { status: "loading" } });
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("says the node is unreachable rather than loading forever", () => {
    renderPanel({
      data: null,
      connection: { status: "offline", nodeName: "Jelly" },
    });

    expect(screen.getByText("Jelly is unreachable")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  it("reports a fetch error rather than loading forever", () => {
    renderPanel({
      data: null,
      connection: { status: "error", error: "Node did not respond" },
    });

    expect(screen.getByText("Node did not respond")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  it("offers a retry when one is available", () => {
    const onRetry = vi.fn();
    renderPanel({
      data: null,
      connection: { status: "error", error: "boom", onRetry },
    });

    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("keeps showing data it already has when the node drops", () => {
    renderPanel({
      data: [1, 2, 3],
      connection: { status: "offline", nodeName: "Jelly", lastUpdate: Date.now() },
    });

    // The figures stay, because they are still the last known truth...
    expect(screen.getByText(/rows: 3/)).toBeInTheDocument();
  });

  it("fades stale data so it cannot be read as live", () => {
    const { container } = renderPanel({
      data: [1],
      connection: { status: "offline", nodeName: "Jelly" },
    });

    expect(container.querySelector(".opacity-40")).toBeInTheDocument();
  });

  it("does not fade live data", () => {
    const { container } = renderPanel({
      data: [1],
      connection: { status: "live" },
    });

    expect(container.querySelector(".opacity-40")).not.toBeInTheDocument();
  });

  it("names the node being switched to", () => {
    renderPanel({
      data: [1],
      connection: { status: "switching", nodeName: "Pi5" },
    });

    expect(screen.getByText("Pi5")).toBeInTheDocument();
  });

  it("renders nothing extra when collapsed", () => {
    renderPanel({
      data: null,
      isCollapsed: true,
      connection: { status: "offline", nodeName: "Jelly" },
    });

    expect(screen.queryByText("Jelly is unreachable")).not.toBeInTheDocument();
  });

  it("falls back to a sensible state when no connection is supplied", () => {
    renderPanel({ data: [1, 2] });
    expect(screen.getByText(/rows: 2/)).toBeInTheDocument();
  });
});
