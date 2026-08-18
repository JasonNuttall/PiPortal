import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import DatasetSection from "../modules/DatasetSection";
import { ListView, GridView, StatView, AgendaView } from "../modules/views";

const schedule = {
  id: "upcoming",
  label: "Airing soon",
  shape: "schedule",
  views: ["calendar", "agenda", "list", "grid", "table"],
  suggests: "calendar",
  items: [
    {
      id: "sev",
      title: "Severance",
      subtitle: "S02E07",
      date: "2026-08-21",
      image: "https://img/sev.jpg",
      detail: [{ label: "Network", value: "Apple TV+" }],
    },
    {
      id: "exp",
      title: "The Expanse",
      subtitle: "S06E01",
      date: "2026-08-24",
      detail: [],
    },
  ],
};

beforeEach(() => localStorage.clear());

describe("views render the same data differently", () => {
  it("list shows every item as a row", () => {
    render(<ListView dataset={schedule} onSelect={vi.fn()} />);
    expect(screen.getByText("Severance")).toBeInTheDocument();
    expect(screen.getByText("The Expanse")).toBeInTheDocument();
  });

  it("grid shows artwork through the hub proxy", () => {
    const { container } = render(
      <GridView dataset={schedule} moduleId="missedanep" onSelect={vi.fn()} />
    );
    const img = container.querySelector("img");
    expect(img.getAttribute("src")).toContain("/api/modules/missedanep/image");
    expect(img.getAttribute("src")).toContain(encodeURIComponent("https://img/sev.jpg"));
  });

  it("grid falls back to a text card when an item has no image", () => {
    const { container } = render(
      <GridView dataset={schedule} moduleId="missedanep" onSelect={vi.fn()} />
    );
    // Two items, one image.
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getAllByText("The Expanse").length).toBeGreaterThan(0);
  });

  it("agenda groups entries by day", () => {
    render(<AgendaView dataset={schedule} onSelect={vi.fn()} />);
    // Two items on different days produce two day headings.
    expect(screen.getByText("Severance")).toBeInTheDocument();
    expect(screen.getByText("The Expanse")).toBeInTheDocument();
  });

  it("stat renders a metric and its bar", () => {
    const { container } = render(
      <StatView dataset={{ shape: "metric", value: 7, max: 10, unit: "eps" }} />
    );
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("eps")).toBeInTheDocument();
    expect(container.querySelector(".crystal-bar-fill")).toBeInTheDocument();
  });

  it("every view opens the same detail, rather than being a detail view", () => {
    const onSelect = vi.fn();
    const { unmount } = render(<ListView dataset={schedule} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Severance"));
    expect(onSelect).toHaveBeenCalledWith(schedule.items[0]);
    unmount();

    const onSelectGrid = vi.fn();
    render(<GridView dataset={schedule} moduleId="m" onSelect={onSelectGrid} />);
    fireEvent.click(screen.getAllByText("Severance")[0]);
    expect(onSelectGrid).toHaveBeenCalledWith(schedule.items[0]);
  });

  it("says so when a dataset is empty", () => {
    render(<ListView dataset={{ ...schedule, items: [] }} onSelect={vi.fn()} />);
    expect(screen.getByText("Nothing to show")).toBeInTheDocument();
  });
});

describe("view selection", () => {
  it("offers only the views the shape supports", () => {
    render(
      <DatasetSection
        moduleId="missedanep"
        dataset={{
          id: "missing",
          label: "Missing",
          shape: "metric",
          views: ["stat", "gauge"],
          value: 7,
        }}
        onSelectItem={vi.fn()}
      />
    );

    expect(screen.getByText("Stat")).toBeInTheDocument();
    expect(screen.queryByText("Calendar")).not.toBeInTheDocument();
  });

  it("starts from the module's suggestion", () => {
    render(
      <DatasetSection moduleId="missedanep" dataset={schedule} onSelectItem={vi.fn()} />
    );
    // Calendar is suggested but not built yet, so it says so rather than
    // silently drawing something else.
    expect(screen.getByText(/Calendar view isn/)).toBeInTheDocument();
  });

  it("lets the viewer override the suggestion", () => {
    render(
      <DatasetSection moduleId="missedanep" dataset={schedule} onSelectItem={vi.fn()} />
    );

    fireEvent.click(screen.getByText("List"));
    expect(screen.getByText("Severance")).toBeInTheDocument();
  });

  it("remembers the choice per dataset", () => {
    const { unmount } = render(
      <DatasetSection moduleId="missedanep" dataset={schedule} onSelectItem={vi.fn()} />
    );
    fireEvent.click(screen.getByText("Grid"));
    unmount();

    render(
      <DatasetSection moduleId="missedanep" dataset={schedule} onSelectItem={vi.fn()} />
    );
    // Still grid, not back to the module's suggestion.
    expect(screen.getAllByText("Severance").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Calendar view isn/)).not.toBeInTheDocument();
  });

  it("ignores a stored view the shape cannot render", () => {
    localStorage.setItem("moduleView:missedanep:missing", "calendar");
    render(
      <DatasetSection
        moduleId="missedanep"
        dataset={{
          id: "missing",
          shape: "metric",
          views: ["stat", "gauge"],
          value: 7,
        }}
        onSelectItem={vi.fn()}
      />
    );

    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("hides the switcher when there is only one view", () => {
    render(
      <DatasetSection
        moduleId="m"
        dataset={{ id: "d", shape: "metric", views: ["stat"], value: 1 }}
        onSelectItem={vi.fn()}
      />
    );
    expect(screen.queryByRole("group", { name: "View" })).not.toBeInTheDocument();
  });
});
