import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MetricsPanel from "../MetricsPanel";

// The header cards read entirely from the selected node's summary, which the
// fleet strip already streams, so no separate metric props are involved.
const summary = {
  cpuLoad: 25.5,
  memoryUsedPercentage: 60,
  temperature: 45,
  containersRunning: 3,
  containersTotal: 4,
  rxSec: 125000,
  txSec: 50000,
};

describe("MetricsPanel", () => {
  it("renders all six cards", () => {
    render(<MetricsPanel summary={summary} />);

    for (const label of [
      "CPU Load",
      "Memory Usage",
      "CPU Temperature",
      "Docker Containers",
      "Download",
      "Upload",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("displays the CPU load", () => {
    render(<MetricsPanel summary={{ ...summary, cpuLoad: 75.3 }} />);
    expect(screen.getByText("75.3")).toBeInTheDocument();
  });

  it("drops a trailing zero from a whole percentage", () => {
    render(<MetricsPanel summary={{ ...summary, cpuLoad: 42 }} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("displays temperature with a unit", () => {
    render(<MetricsPanel summary={{ ...summary, temperature: 52 }} />);
    expect(screen.getByText("52")).toBeInTheDocument();
    expect(screen.getByText("°C")).toBeInTheDocument();
  });

  it("shows N/A and no unit when the node reports no temperature", () => {
    render(<MetricsPanel summary={{ ...summary, temperature: null }} />);
    expect(screen.getByText("N/A")).toBeInTheDocument();
    expect(screen.queryByText("°C")).not.toBeInTheDocument();
  });

  it("converts throughput from bytes per second to Mb/s", () => {
    // 125000 B/s * 8 = 1 Mb/s
    render(<MetricsPanel summary={summary} />);
    expect(screen.getByText("1.0")).toBeInTheDocument();
    expect(screen.getByText("0.4")).toBeInTheDocument();
  });

  it("shows running against total containers", () => {
    render(<MetricsPanel summary={summary} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("/ 4")).toBeInTheDocument();
  });

  it("renders zeroes rather than crashing when no summary has arrived", () => {
    render(<MetricsPanel summary={null} />);
    expect(screen.getByText("CPU Load")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  });
});
