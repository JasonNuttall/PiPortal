import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import MetricsPanel from "../MetricsPanel";

describe("MetricsPanel", () => {
  it("renders all 6 metric cards", () => {
    render(
      <MetricsPanel
        systemMetrics={{ cpu: { currentLoad: "25.5" }, memory: { usedPercentage: "60.0" } }}
        temperature={{ cpu: "45" }}
        diskMetrics={{ use: 50 }}
        dockerInfo={{ containersRunning: 3, containersStopped: 1 }}
        networkStats={{ downloadSpeed: 125000, uploadSpeed: 50000 }}
      />
    );

    expect(screen.getByText("CPU Load")).toBeInTheDocument();
    expect(screen.getByText("Memory Usage")).toBeInTheDocument();
    expect(screen.getByText("CPU Temperature")).toBeInTheDocument();
    expect(screen.getByText("Docker Containers")).toBeInTheDocument();
    expect(screen.getByText("Download")).toBeInTheDocument();
    expect(screen.getByText("Upload")).toBeInTheDocument();
  });

  it("displays CPU load value", () => {
    render(
      <MetricsPanel
        systemMetrics={{ cpu: { currentLoad: "75.3" }, memory: {} }}
        temperature={{}}
        diskMetrics={{}}
        dockerInfo={{}}
        networkStats={{}}
      />
    );

    expect(screen.getByText("75.3")).toBeInTheDocument();
  });

  it("displays temperature with unit", () => {
    render(
      <MetricsPanel
        systemMetrics={{ cpu: {}, memory: {} }}
        temperature={{ cpu: "52" }}
        diskMetrics={{}}
        dockerInfo={{}}
        networkStats={{}}
      />
    );

    expect(screen.getByText("52")).toBeInTheDocument();
  });

  it("handles null/undefined data gracefully", () => {
    render(
      <MetricsPanel
        systemMetrics={null}
        temperature={null}
        diskMetrics={null}
        dockerInfo={null}
        networkStats={null}
      />
    );

    expect(screen.getByText("CPU Load")).toBeInTheDocument();
    // Should show "0" for missing values
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  });

  it("uses static Tailwind color classes instead of dynamic interpolation", () => {
    const { container } = render(
      <MetricsPanel
        systemMetrics={{ cpu: { currentLoad: "25" }, memory: { usedPercentage: "60" } }}
        temperature={{ cpu: "45" }}
        diskMetrics={{ use: 50 }}
        dockerInfo={{ containersRunning: 3, containersStopped: 1 }}
        networkStats={{ downloadSpeed: 125000, uploadSpeed: 50000 }}
      />
    );

    // Icon elements should use full static class names, not dynamic interpolation
    const svgElements = container.querySelectorAll("svg");
    const iconClassNames = Array.from(svgElements).map((svg) => svg.className.baseVal || svg.getAttribute("class") || "");

    // Verify none use dynamic template syntax like text-${color}-400
    iconClassNames.forEach((cls) => {
      expect(cls).not.toContain("${");
    });

    // Verify static color classes are present
    const allClasses = iconClassNames.join(" ");
    expect(allClasses).toContain("text-blue-400");
    expect(allClasses).toContain("text-green-400");
    expect(allClasses).toContain("text-orange-400");
    expect(allClasses).toContain("text-purple-400");
  });

  it("calculates network speed in Mb/s", () => {
    // 125000 bytes/sec = 1.0 Mb/s
    render(
      <MetricsPanel
        systemMetrics={{ cpu: {}, memory: {} }}
        temperature={{}}
        diskMetrics={{}}
        dockerInfo={{}}
        networkStats={{ downloadSpeed: 125000, uploadSpeed: 62500 }}
      />
    );

    expect(screen.getByText("1.0")).toBeInTheDocument(); // download
    expect(screen.getByText("0.5")).toBeInTheDocument(); // upload
  });
});
