import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorBoundary from "../ErrorBoundary";

// A component that throws on demand
const ThrowingComponent = ({ shouldThrow }) => {
  if (shouldThrow) {
    throw new Error("Test crash");
  }
  return <div>Content rendered OK</div>;
};

// Suppress console.error from React's error boundary logging during tests
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary panelName="Test">
        <div>Hello World</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("renders fallback UI when child throws", () => {
    render(
      <ErrorBoundary panelName="Network">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Network Error")).toBeInTheDocument();
    expect(
      screen.getByText("Something went wrong rendering this panel.")
    ).toBeInTheDocument();
  });

  it("displays the panel name in error heading", () => {
    render(
      <ErrorBoundary panelName="Docker">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Docker Error")).toBeInTheDocument();
  });

  it("uses default panel name when not provided", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Panel Error")).toBeInTheDocument();
  });

  it("shows a Retry button", () => {
    render(
      <ErrorBoundary panelName="Disk">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("recovers when Retry is clicked and child no longer throws", () => {
    const { rerender } = render(
      <ErrorBoundary panelName="Services">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Services Error")).toBeInTheDocument();

    // Click retry — ErrorBoundary resets, and we rerender with non-throwing child
    // We need to change the child to not throw before clicking retry
    rerender(
      <ErrorBoundary panelName="Services">
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>
    );

    // After rerender the boundary resets because key/props changed
    // But the state is still errored. Click retry to reset.
    // Actually, since rerender preserves the instance, state is still errored.
    // We need to click retry.
    fireEvent.click(screen.getByText("Retry"));

    expect(screen.getByText("Content rendered OK")).toBeInTheDocument();
  });

  it("does not affect sibling error boundaries", () => {
    render(
      <div>
        <ErrorBoundary panelName="Healthy">
          <div>I am fine</div>
        </ErrorBoundary>
        <ErrorBoundary panelName="Broken">
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>
      </div>
    );

    expect(screen.getByText("I am fine")).toBeInTheDocument();
    expect(screen.getByText("Broken Error")).toBeInTheDocument();
  });

  it("logs error to console", () => {
    render(
      <ErrorBoundary panelName="Processes">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(console.error).toHaveBeenCalled();
  });
});
