import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DiskPanel from "../DiskPanel";

const defaultProps = {
  isCollapsed: false,
  onCollapseChange: vi.fn(),
  panelId: "disk",
  dataMode: "polling",
  onModeChange: vi.fn(),
  wsConnected: false,
  hiddenPartitions: [],
  onHiddenPartitionsChange: vi.fn(),
};

const mockDiskData = [
  { mount: "/", type: "ext4", use: 45.2, usedGB: "7.50", availableGB: "8.50", sizeGB: "16.00" },
  { mount: "/home", type: "ext4", use: 72.1, usedGB: "28.50", availableGB: "11.50", sizeGB: "40.00" },
  { mount: "/boot", type: "vfat", use: 25.0, usedGB: "0.06", availableGB: "0.19", sizeGB: "0.25" },
];

describe("DiskPanel", () => {
  it("renders all disk partitions", () => {
    render(<DiskPanel {...defaultProps} data={mockDiskData} />);

    expect(screen.getByText("/")).toBeInTheDocument();
    expect(screen.getByText("/home")).toBeInTheDocument();
    expect(screen.getByText("/boot")).toBeInTheDocument();
  });

  it("displays usage percentage", () => {
    render(<DiskPanel {...defaultProps} data={mockDiskData} />);
    expect(screen.getByText("45.2%")).toBeInTheDocument();
    expect(screen.getByText("72.1%")).toBeInTheDocument();
  });

  it("displays storage info", () => {
    render(<DiskPanel {...defaultProps} data={mockDiskData} />);
    expect(screen.getByText("7.50 GB")).toBeInTheDocument();
    expect(screen.getByText("16.00 GB")).toBeInTheDocument();
  });

  it("shows subtitle with visible/total count", () => {
    render(<DiskPanel {...defaultProps} data={mockDiskData} />);
    expect(screen.getByText("(3/3)")).toBeInTheDocument();
  });

  it("hides partitions that are in hiddenPartitions", () => {
    render(<DiskPanel {...defaultProps} data={mockDiskData} hiddenPartitions={["/boot"]} />);

    expect(screen.getByText("/")).toBeInTheDocument();
    expect(screen.getByText("/home")).toBeInTheDocument();
    // /boot should be hidden from the main content
    expect(screen.getByText("(2/3)")).toBeInTheDocument();
  });

  it("shows filesystem type", () => {
    render(<DiskPanel {...defaultProps} data={mockDiskData} />);
    expect(screen.getAllByText("ext4")).toHaveLength(2);
    expect(screen.getByText("vfat")).toBeInTheDocument();
  });

  it("shows loading when data is null", () => {
    render(<DiskPanel {...defaultProps} data={null} />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});
