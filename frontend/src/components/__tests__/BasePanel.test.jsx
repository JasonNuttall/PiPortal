import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BasePanel from "../BasePanel";
import { Activity } from "lucide-react";

describe("BasePanel", () => {
  const defaultProps = {
    title: "Test Panel",
    icon: Activity,
    data: { test: true },
  };

  it("renders title", () => {
    render(<BasePanel {...defaultProps}>{() => <div>Content</div>}</BasePanel>);
    expect(screen.getByText("Test Panel")).toBeInTheDocument();
  });

  it("renders children when not collapsed", () => {
    render(
      <BasePanel {...defaultProps}>
        {(data) => <div>Data: {JSON.stringify(data)}</div>}
      </BasePanel>
    );
    expect(screen.getByText(/Data:/)).toBeInTheDocument();
  });

  it("hides content when collapsed", () => {
    render(
      <BasePanel {...defaultProps} isCollapsed={true}>
        {() => <div>Hidden Content</div>}
      </BasePanel>
    );
    expect(screen.queryByText("Hidden Content")).not.toBeInTheDocument();
  });

  it("shows loading when data is null", () => {
    render(
      <BasePanel {...defaultProps} data={null}>
        {() => <div>Content</div>}
      </BasePanel>
    );
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("calls onCollapseChange when header clicked", () => {
    const onCollapseChange = vi.fn();
    render(
      <BasePanel {...defaultProps} isCollapsed={false} onCollapseChange={onCollapseChange}>
        {() => <div>Content</div>}
      </BasePanel>
    );

    fireEvent.click(screen.getByText("Test Panel"));
    expect(onCollapseChange).toHaveBeenCalledWith(true);
  });

  it("renders subtitle", () => {
    render(
      <BasePanel {...defaultProps} subtitle="(3)">
        {() => <div>Content</div>}
      </BasePanel>
    );
    expect(screen.getByText("(3)")).toBeInTheDocument();
  });

  it("renders subtitle as function", () => {
    render(
      <BasePanel {...defaultProps} subtitle={(data) => `(${data.test})`}>
        {() => <div>Content</div>}
      </BasePanel>
    );
    expect(screen.getByText("(true)")).toBeInTheDocument();
  });

  it("renders mode toggle when panelId and onModeChange provided", () => {
    const onModeChange = vi.fn();
    render(
      <BasePanel {...defaultProps} panelId="test" dataMode="polling" onModeChange={onModeChange}>
        {() => <div>Content</div>}
      </BasePanel>
    );
    expect(screen.getByText("Poll")).toBeInTheDocument();
  });

  it("shows Live label in websocket mode", () => {
    render(
      <BasePanel {...defaultProps} panelId="test" dataMode="websocket" onModeChange={vi.fn()} wsConnected={true}>
        {() => <div>Content</div>}
      </BasePanel>
    );
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("toggles mode when mode button clicked", () => {
    const onModeChange = vi.fn();
    render(
      <BasePanel {...defaultProps} panelId="test" dataMode="polling" onModeChange={onModeChange}>
        {() => <div>Content</div>}
      </BasePanel>
    );

    fireEvent.click(screen.getByText("Poll"));
    expect(onModeChange).toHaveBeenCalledWith("websocket");
  });

  it("renders header actions when not collapsed", () => {
    render(
      <BasePanel {...defaultProps} headerActions={<button>Action</button>}>
        {() => <div>Content</div>}
      </BasePanel>
    );
    expect(screen.getByText("Action")).toBeInTheDocument();
  });

  it("hides header actions when collapsed", () => {
    render(
      <BasePanel {...defaultProps} isCollapsed={true} headerActions={<button>Action</button>}>
        {() => <div>Content</div>}
      </BasePanel>
    );
    expect(screen.queryByText("Action")).not.toBeInTheDocument();
  });

  it("renders direct JSX children", () => {
    render(
      <BasePanel {...defaultProps}>
        <div>Direct JSX</div>
      </BasePanel>
    );
    expect(screen.getByText("Direct JSX")).toBeInTheDocument();
  });
});
