import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProcessPanel from "../ProcessPanel";

const defaultProps = {
  isCollapsed: false,
  onCollapseChange: vi.fn(),
  panelId: "processes",
  dataMode: "polling",
  onModeChange: vi.fn(),
  wsConnected: false,
};

const mockProcessData = {
  running: 5,
  all: 100,
  list: [
    { pid: 1, name: "node", command: "node server.js", user: "root", cpu: 25.5, mem: 8.2, memRssMB: 420 },
    { pid: 2, name: "python", command: "python app.py", user: "user", cpu: 15.0, mem: 4.1, memRssMB: 210 },
    { pid: 3, name: "nginx", command: "nginx -g daemon off", user: "www", cpu: 2.0, mem: 1.5, memRssMB: 76 },
  ],
};

describe("ProcessPanel", () => {
  it("renders process list", () => {
    render(<ProcessPanel {...defaultProps} data={mockProcessData} />);

    expect(screen.getByText("node")).toBeInTheDocument();
    expect(screen.getByText("python")).toBeInTheDocument();
    expect(screen.getByText("nginx")).toBeInTheDocument();
  });

  it("displays process count in subtitle", () => {
    render(<ProcessPanel {...defaultProps} data={mockProcessData} />);
    expect(screen.getByText("(5 running / 100 total)")).toBeInTheDocument();
  });

  it("shows process count footer", () => {
    render(<ProcessPanel {...defaultProps} data={mockProcessData} />);
    expect(screen.getByText("Showing 3 of 3 processes")).toBeInTheDocument();
  });

  it("filters processes by search", () => {
    render(<ProcessPanel {...defaultProps} data={mockProcessData} />);

    const searchInput = screen.getByPlaceholderText("Search processes...");
    fireEvent.change(searchInput, { target: { value: "python" } });

    expect(screen.getByText("python")).toBeInTheDocument();
    expect(screen.queryByText("node")).not.toBeInTheDocument();
    expect(screen.queryByText("nginx")).not.toBeInTheDocument();
  });

  it("filters by user name", () => {
    render(<ProcessPanel {...defaultProps} data={mockProcessData} />);

    const searchInput = screen.getByPlaceholderText("Search processes...");
    fireEvent.change(searchInput, { target: { value: "root" } });

    expect(screen.getByText("node")).toBeInTheDocument();
    expect(screen.queryByText("python")).not.toBeInTheDocument();
  });

  it("displays CPU percentage", () => {
    render(<ProcessPanel {...defaultProps} data={mockProcessData} />);
    expect(screen.getByText("25.5%")).toBeInTheDocument();
    expect(screen.getByText("15.0%")).toBeInTheDocument();
  });

  it("displays memory percentage", () => {
    render(<ProcessPanel {...defaultProps} data={mockProcessData} />);
    expect(screen.getByText("8.2%")).toBeInTheDocument();
  });

  it("shows loading when data is null", () => {
    render(<ProcessPanel {...defaultProps} data={null} />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});
