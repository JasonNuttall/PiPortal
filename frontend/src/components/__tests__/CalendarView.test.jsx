import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import CalendarView, { buildMonthGrid, localDayKey } from "../modules/CalendarView";

const dataset = (items, window = true) => ({
  id: "upcoming",
  shape: "schedule",
  views: ["calendar", "agenda", "list"],
  window,
  items,
});

const item = (id, title, date, extra = {}) => ({
  id,
  title,
  subtitle: "S01E01",
  date,
  detail: [],
  ...extra,
});

const renderMonth = (ds, props = {}) =>
  render(
    <CalendarView
      dataset={ds}
      cursor={{ year: 2026, month: 7 }} // August 2026
      onCursorChange={vi.fn()}
      onSelect={vi.fn()}
      {...props}
    />
  );

describe("buildMonthGrid", () => {
  it("always returns six weeks so the panel height is stable", () => {
    expect(buildMonthGrid(2026, 7)).toHaveLength(42);
    expect(buildMonthGrid(2026, 1)).toHaveLength(42);
  });

  it("starts the week on Monday", () => {
    // 1 August 2026 is a Saturday, so the grid opens on Monday 27 July.
    const grid = buildMonthGrid(2026, 7);
    expect(grid[0].day).toBe(27);
    expect(grid[0].inMonth).toBe(false);
  });

  it("marks which cells belong to the month", () => {
    const grid = buildMonthGrid(2026, 7);
    const inMonth = grid.filter((cell) => cell.inMonth);
    expect(inMonth).toHaveLength(31);
    expect(inMonth[0].day).toBe(1);
  });

  it("handles a month starting on Monday without a blank week", () => {
    // 1 June 2026 is a Monday.
    const grid = buildMonthGrid(2026, 5);
    expect(grid[0].day).toBe(1);
    expect(grid[0].inMonth).toBe(true);
  });

  it("handles February in a leap year", () => {
    const grid = buildMonthGrid(2028, 1);
    expect(grid.filter((c) => c.inMonth)).toHaveLength(29);
  });
});

describe("localDayKey", () => {
  it("uses local date parts, not UTC", () => {
    // A UTC-based key can land an evening item on the following day.
    const date = new Date(2026, 7, 21, 23, 30);
    expect(localDayKey(date)).toBe("2026-08-21");
  });

  it("returns null for an unparseable date", () => {
    expect(localDayKey("someday")).toBeNull();
  });
});

describe("rendering", () => {
  it("shows the month and year", () => {
    renderMonth(dataset([]));
    expect(screen.getByText(/August 2026/)).toBeInTheDocument();
  });

  it("places an entry on its day", () => {
    renderMonth(dataset([item("a", "Severance", "2026-08-21")]));
    expect(screen.getByText("Severance")).toBeInTheDocument();
  });

  it("does not show an entry from outside the drawn range", () => {
    renderMonth(dataset([item("a", "Severance", "2026-12-25")]));
    expect(screen.queryByText("Severance")).not.toBeInTheDocument();
  });

  it("opens the detail for a clicked entry", () => {
    const onSelect = vi.fn();
    const entry = item("a", "Severance", "2026-08-21");
    renderMonth(dataset([entry]), { onSelect });

    fireEvent.click(screen.getByText("Severance"));
    expect(onSelect).toHaveBeenCalledWith(entry);
  });

  it("collapses a busy day into a count rather than overflowing", () => {
    const busy = [
      item("a", "One", "2026-08-21"),
      item("b", "Two", "2026-08-21"),
      item("c", "Three", "2026-08-21"),
      item("d", "Four", "2026-08-21"),
      item("e", "Five", "2026-08-21"),
    ];
    renderMonth(dataset(busy));

    expect(screen.getByText("+2 more")).toBeInTheDocument();
    expect(screen.queryByText("Five")).not.toBeInTheDocument();
  });

  it("steps to the next month", () => {
    const onCursorChange = vi.fn();
    renderMonth(dataset([]), { onCursorChange });

    fireEvent.click(screen.getByLabelText("Next month"));
    expect(onCursorChange).toHaveBeenCalledWith({ year: 2026, month: 8 });
  });

  it("wraps to January when stepping past December", () => {
    const onCursorChange = vi.fn();
    render(
      <CalendarView
        dataset={dataset([])}
        cursor={{ year: 2026, month: 11 }}
        onCursorChange={onCursorChange}
        onSelect={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText("Next month"));
    expect(onCursorChange).toHaveBeenCalledWith({ year: 2027, month: 0 });
  });

  it("disables navigation when the module cannot window", () => {
    // Without windowing there is no more data to page to, so the arrows would
    // only ever reveal empty months.
    renderMonth(dataset([], false));
    expect(screen.getByLabelText("Next month")).toBeDisabled();
    expect(screen.getByLabelText("Previous month")).toBeDisabled();
  });

  it("enables navigation when the module supports windowing", () => {
    renderMonth(dataset([], true));
    expect(screen.getByLabelText("Next month")).not.toBeDisabled();
  });
});
