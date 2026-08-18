import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { useDialog } from "../useDialog";

const Dialog = ({ onClose }) => {
  const ref = useDialog(onClose);
  return (
    <div ref={ref} role="dialog">
      <button type="button" aria-label="Close">
        ×
      </button>
      <input aria-label="Name" />
      <button type="button">Save</button>
    </div>
  );
};

describe("useDialog", () => {
  it("moves focus into the dialog when it opens", () => {
    render(<Dialog onClose={vi.fn()} />);
    expect(screen.getByLabelText("Close")).toHaveFocus();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the caret in a field when the parent re-renders", () => {
    // The reported bug: callers pass an inline arrow for onClose, so its
    // identity changed on every parent render — and the parent re-renders
    // whenever fleet data arrives. Re-running setup stole focus back to the
    // close button mid-typing.
    const { rerender } = render(<Dialog onClose={() => {}} />);

    const input = screen.getByLabelText("Name");
    input.focus();
    fireEvent.change(input, { target: { value: "Jelly" } });
    expect(input).toHaveFocus();

    // A fresh callback identity, exactly as an inline arrow produces.
    rerender(<Dialog onClose={() => {}} />);

    expect(input).toHaveFocus();
    expect(screen.getByLabelText("Close")).not.toHaveFocus();
  });

  it("still closes on Escape after the parent has re-rendered", () => {
    // The fix must not leave the handler pointing at a stale callback.
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Dialog onClose={first} />);

    rerender(<Dialog onClose={second} />);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });

  it("keeps Tab inside the dialog", () => {
    render(<Dialog onClose={vi.fn()} />);

    const save = screen.getByText("Save");
    save.focus();
    fireEvent.keyDown(document, { key: "Tab" });

    expect(screen.getByLabelText("Close")).toHaveFocus();
  });

  it("wraps backwards from the first element", () => {
    render(<Dialog onClose={vi.fn()} />);

    screen.getByLabelText("Close").focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    expect(screen.getByText("Save")).toHaveFocus();
  });

  it("restores focus to whatever opened it", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(<Dialog onClose={vi.fn()} />);
    unmount();

    expect(opener).toHaveFocus();
    opener.remove();
  });
});
