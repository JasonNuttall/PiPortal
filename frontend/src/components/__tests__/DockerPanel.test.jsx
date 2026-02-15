import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DockerPanel from "../DockerPanel";

vi.mock("../../api/api", () => ({
  containerAction: vi.fn().mockResolvedValue({ success: true }),
}));

import { containerAction } from "../../api/api";

const defaultProps = {
  isCollapsed: false,
  onCollapseChange: vi.fn(),
  onUpdate: vi.fn(),
  panelId: "docker",
  dataMode: "polling",
  onModeChange: vi.fn(),
  wsConnected: false,
};

describe("DockerPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty state when no containers", () => {
    render(<DockerPanel {...defaultProps} containers={[]} />);
    expect(screen.getByText("No containers found")).toBeInTheDocument();
  });

  it("renders container names", () => {
    const containers = [
      { id: "abc123", name: "portainer", image: "portainer/portainer", state: "running", status: "Up 3 days", ports: [] },
      { id: "def456", name: "pihole", image: "pihole/pihole", state: "exited", status: "Exited (0) 2 hours ago", ports: [] },
    ];

    render(<DockerPanel {...defaultProps} containers={containers} />);
    expect(screen.getByText("portainer")).toBeInTheDocument();
    expect(screen.getByText("pihole")).toBeInTheDocument();
  });

  it("renders container images", () => {
    const containers = [
      { id: "abc123", name: "test", image: "nginx:latest", state: "running", status: "Up", ports: [] },
    ];

    render(<DockerPanel {...defaultProps} containers={containers} />);
    expect(screen.getByText("nginx:latest")).toBeInTheDocument();
  });

  it("renders container state badge", () => {
    const containers = [
      { id: "abc123", name: "test", image: "nginx", state: "running", status: "Up", ports: [] },
    ];

    render(<DockerPanel {...defaultProps} containers={containers} />);
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("renders public port mappings", () => {
    const containers = [
      {
        id: "abc123", name: "web", image: "nginx", state: "running", status: "Up",
        ports: [
          { public: 8080, private: 80, type: "tcp" },
          { public: null, private: 443, type: "tcp" },
        ],
      },
    ];

    render(<DockerPanel {...defaultProps} containers={containers} />);
    expect(screen.getByText(/8080/)).toBeInTheDocument();
  });

  it("shows container count in subtitle", () => {
    const containers = [
      { id: "a", name: "one", image: "img", state: "running", status: "Up", ports: [] },
      { id: "b", name: "two", image: "img", state: "running", status: "Up", ports: [] },
    ];

    render(<DockerPanel {...defaultProps} containers={containers} />);
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  // Action button tests
  it("shows stop and restart buttons for running containers", () => {
    const containers = [
      { id: "abc123", name: "web", image: "nginx", state: "running", status: "Up", ports: [] },
    ];
    render(<DockerPanel {...defaultProps} containers={containers} />);
    expect(screen.getByTitle("Stop")).toBeInTheDocument();
    expect(screen.getByTitle("Restart")).toBeInTheDocument();
    expect(screen.queryByTitle("Start")).not.toBeInTheDocument();
  });

  it("shows start button for exited containers", () => {
    const containers = [
      { id: "abc123", name: "web", image: "nginx", state: "exited", status: "Exited", ports: [] },
    ];
    render(<DockerPanel {...defaultProps} containers={containers} />);
    expect(screen.getByTitle("Start")).toBeInTheDocument();
    expect(screen.queryByTitle("Stop")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Restart")).not.toBeInTheDocument();
  });

  it("shows start button for paused containers", () => {
    const containers = [
      { id: "abc123", name: "web", image: "nginx", state: "paused", status: "Paused", ports: [] },
    ];
    render(<DockerPanel {...defaultProps} containers={containers} />);
    expect(screen.getByTitle("Start")).toBeInTheDocument();
  });

  it("shows no action buttons for unknown states", () => {
    const containers = [
      { id: "abc123", name: "web", image: "nginx", state: "removing", status: "Removing", ports: [] },
    ];
    render(<DockerPanel {...defaultProps} containers={containers} />);
    expect(screen.queryByTitle("Start")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Stop")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Restart")).not.toBeInTheDocument();
  });

  it("calls containerAction and onUpdate when stop is clicked", async () => {
    const onUpdate = vi.fn();
    const containers = [
      { id: "abc123", name: "web", image: "nginx", state: "running", status: "Up", ports: [] },
    ];
    render(<DockerPanel {...defaultProps} containers={containers} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByTitle("Stop"));

    await waitFor(() => {
      expect(containerAction).toHaveBeenCalledWith("abc123", "stop");
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  it("calls containerAction and onUpdate when start is clicked", async () => {
    const onUpdate = vi.fn();
    const containers = [
      { id: "def456", name: "db", image: "postgres", state: "exited", status: "Exited", ports: [] },
    ];
    render(<DockerPanel {...defaultProps} containers={containers} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByTitle("Start"));

    await waitFor(() => {
      expect(containerAction).toHaveBeenCalledWith("def456", "start");
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  it("calls containerAction and onUpdate when restart is clicked", async () => {
    const onUpdate = vi.fn();
    const containers = [
      { id: "abc123", name: "web", image: "nginx", state: "running", status: "Up", ports: [] },
    ];
    render(<DockerPanel {...defaultProps} containers={containers} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByTitle("Restart"));

    await waitFor(() => {
      expect(containerAction).toHaveBeenCalledWith("abc123", "restart");
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  it("handles action errors gracefully", async () => {
    containerAction.mockRejectedValueOnce(new Error("Failed to stop container"));
    const onUpdate = vi.fn();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const containers = [
      { id: "abc123", name: "web", image: "nginx", state: "running", status: "Up", ports: [] },
    ];
    render(<DockerPanel {...defaultProps} containers={containers} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByTitle("Stop"));

    await waitFor(() => {
      expect(containerAction).toHaveBeenCalledWith("abc123", "stop");
      expect(onUpdate).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });
});
