import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import NetworkPanel from "../NetworkPanel";

const defaultProps = {
  isCollapsed: false,
  onCollapseChange: vi.fn(),
  panelId: "network",
  dataMode: "polling",
  onModeChange: vi.fn(),
  wsConnected: false,
};

describe("NetworkPanel", () => {
  it("renders interface names", () => {
    const data = {
      stats: [
        { interface: "eth0", rx_bytes: 1000000, tx_bytes: 500000, rx_sec: 0, tx_sec: 0, rx_errors: 0, tx_errors: 0 },
        { interface: "wlan0", rx_bytes: 2000000, tx_bytes: 100000, rx_sec: 0, tx_sec: 0, rx_errors: 0, tx_errors: 0 },
      ],
    };

    render(<NetworkPanel {...defaultProps} data={data} />);
    expect(screen.getByText("eth0")).toBeInTheDocument();
    expect(screen.getByText("wlan0")).toBeInTheDocument();
  });

  it("shows download and upload labels", () => {
    const data = {
      stats: [
        { interface: "eth0", rx_bytes: 1000, tx_bytes: 500, rx_sec: 100, tx_sec: 50, rx_errors: 0, tx_errors: 0 },
      ],
    };

    render(<NetworkPanel {...defaultProps} data={data} />);
    expect(screen.getByText("Download")).toBeInTheDocument();
    expect(screen.getByText("Upload")).toBeInTheDocument();
  });

  it("shows errors when present", () => {
    const data = {
      stats: [
        { interface: "eth0", rx_bytes: 1000, tx_bytes: 500, rx_sec: 0, tx_sec: 0, rx_errors: 5, tx_errors: 3 },
      ],
    };

    render(<NetworkPanel {...defaultProps} data={data} />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("hides errors when zero", () => {
    const data = {
      stats: [
        { interface: "eth0", rx_bytes: 1000, tx_bytes: 500, rx_sec: 0, tx_sec: 0, rx_errors: 0, tx_errors: 0 },
      ],
    };

    render(<NetworkPanel {...defaultProps} data={data} />);
    expect(screen.queryByText("Errors:")).not.toBeInTheDocument();
  });

  it("shows loading when data is null", () => {
    render(<NetworkPanel {...defaultProps} data={null} />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});
