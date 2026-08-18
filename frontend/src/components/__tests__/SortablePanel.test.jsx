import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import SortablePanel from "../SortablePanel";

const mockSortable = vi.hoisted(() => ({ current: {} }));

vi.mock("@dnd-kit/sortable", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useSortable: () => mockSortable.current,
  };
});

const baseSortable = {
  attributes: {},
  listeners: {},
  setNodeRef: () => {},
  transform: null,
  transition: null,
  isDragging: false,
};

beforeEach(() => {
  mockSortable.current = { ...baseSortable };
});

const renderPanel = (props = {}) =>
  render(
    <DndContext>
      <SortableContext items={["disk"]}>
        <SortablePanel id="disk" {...props}>
          <div>Disk contents</div>
        </SortablePanel>
      </SortableContext>
    </DndContext>
  );

describe("grid attributes", () => {
  it("exposes its size so the grid can span columns", () => {
    const { container } = renderPanel({ size: "wide" });
    expect(container.querySelector('[data-size="wide"]')).toBeInTheDocument();
  });

  it("marks itself collapsed so the grid can shrink it", () => {
    const { container } = renderPanel({ isCollapsed: true });
    expect(container.querySelector('[data-collapsed="true"]')).toBeInTheDocument();
  });

  it("reports whether it has been measured yet", () => {
    const { container } = renderPanel();
    expect(container.querySelector("[data-measured]")).toBeInTheDocument();
  });

  it("renders its children", () => {
    renderPanel();
    expect(screen.getByText("Disk contents")).toBeInTheDocument();
  });
});

describe("dragging", () => {
  it("translates without scaling", () => {
    // dnd-kit's transform includes scaleX/scaleY, which stretched panels into
    // the size of whatever they were dragged over once panels stopped being
    // uniformly sized.
    mockSortable.current = {
      ...baseSortable,
      isDragging: true,
      transform: { x: 40, y: 90, scaleX: 2.4, scaleY: 0.3 },
    };

    const { container } = renderPanel({ size: "wide" });
    const style = container.querySelector("[data-size]").getAttribute("style");

    expect(style).toContain("translate");
    expect(style).not.toContain("scale");
  });

  it("fades the panel being dragged", () => {
    mockSortable.current = { ...baseSortable, isDragging: true, transform: null };
    const { container } = renderPanel();
    expect(container.querySelector("[data-size]").getAttribute("style")).toContain(
      "opacity: 0.5"
    );
  });

  it("carries a row span so the grid can pack it", () => {
    const { container } = renderPanel();
    expect(container.querySelector("[data-size]").getAttribute("style")).toContain(
      "--row-span"
    );
  });
});
