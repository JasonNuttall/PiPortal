import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DockerPanel from "../DockerPanel";

const defaultProps = {
  isCollapsed: false,
  onCollapseChange: vi.fn(),
  panelId: "docker",
  dataMode: "polling",
  onModeChange: vi.fn(),
  wsConnected: false,
};

describe("DockerPanel", () => {
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
    // Only public ports should show
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
});
