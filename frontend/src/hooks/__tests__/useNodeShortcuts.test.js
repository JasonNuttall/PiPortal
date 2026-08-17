import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useNodeShortcuts } from "../useNodeShortcuts";

const nodes = [
  { id: "pi5" },
  { id: "jelly" },
  { id: "nas" },
];

const press = (key, target = document.body) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true });
  Object.defineProperty(event, "target", { value: target });
  document.dispatchEvent(event);
};

const setup = (selectedId = "pi5", enabled = true) => {
  const selectNode = vi.fn();
  renderHook(() => useNodeShortcuts(nodes, selectedId, selectNode, enabled));
  return selectNode;
};

describe("useNodeShortcuts", () => {
  it("jumps to a node by number", () => {
    const selectNode = setup();
    press("2");
    expect(selectNode).toHaveBeenCalledWith("jelly");
  });

  it("ignores a number with no matching node", () => {
    const selectNode = setup();
    press("9");
    expect(selectNode).not.toHaveBeenCalled();
  });

  it("steps forward with ]", () => {
    const selectNode = setup("pi5");
    press("]");
    expect(selectNode).toHaveBeenCalledWith("jelly");
  });

  it("steps backward with [", () => {
    const selectNode = setup("jelly");
    press("[");
    expect(selectNode).toHaveBeenCalledWith("pi5");
  });

  it("wraps around at the ends", () => {
    const selectNode = setup("nas");
    press("]");
    expect(selectNode).toHaveBeenCalledWith("pi5");
  });

  it("does not fire while typing in an input", () => {
    const selectNode = setup();
    const input = document.createElement("input");
    document.body.appendChild(input);

    press("2", input);

    expect(selectNode).not.toHaveBeenCalled();
    input.remove();
  });

  it("does not fire when disabled, so a modal keeps its keys", () => {
    const selectNode = setup("pi5", false);
    press("2");
    expect(selectNode).not.toHaveBeenCalled();
  });

  it("ignores shortcuts modified with ctrl or meta", () => {
    const selectNode = vi.fn();
    renderHook(() => useNodeShortcuts(nodes, "pi5", selectNode, true));

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "2", ctrlKey: true, bubbles: true })
    );

    expect(selectNode).not.toHaveBeenCalled();
  });
});
