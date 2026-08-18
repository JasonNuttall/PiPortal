import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ModuleDialog from "../modules/ModuleDialog";

vi.mock("../../api/api", () => ({
  createModule: vi.fn().mockResolvedValue({}),
  updateModule: vi.fn().mockResolvedValue({}),
  deleteModule: vi.fn().mockResolvedValue(undefined),
  testModule: vi.fn().mockResolvedValue({ ok: true, latencyMs: 4, info: { datasets: [1, 2] } }),
  fetchAdapters: vi.fn().mockResolvedValue([{ id: "jellyfin", label: "Jellyfin" }]),
}));

import {
  createModule,
  updateModule,
  deleteModule,
  testModule,
} from "../../api/api";

const nodes = [
  { id: "pi5", name: "Redberry-Pi" },
  { id: "jelly", name: "Jelly" },
];

const open = (props = {}) =>
  render(
    <ModuleDialog
      module={null}
      nodes={nodes}
      onClose={vi.fn()}
      onSaved={vi.fn()}
      {...props}
    />
  );

/** The heading and the submit button share wording, so target the button. */
const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: /^(Add|Save)/ }));

beforeEach(() => vi.clearAllMocks());

describe("adding", () => {
  it("derives the id from the name", () => {
    open();
    fireEvent.change(screen.getByPlaceholderText("Jellyfin"), {
      target: { value: "Missed an Ep" },
    });
    expect(screen.getByPlaceholderText("jellyfin").value).toBe("missed-an-ep");
  });

  it("rejects a malformed URL before submitting", async () => {
    open();
    fireEvent.change(screen.getByPlaceholderText("Jellyfin"), {
      target: { value: "Thing" },
    });
    fireEvent.change(screen.getByPlaceholderText("http://jelly:3014"), {
      target: { value: "jelly:3014" },
    });
    submit();

    expect(await screen.findByText("Must be http or https")).toBeInTheDocument();
    expect(createModule).not.toHaveBeenCalled();
  });

  it("requires an adapter to be chosen when the kind is adapter", async () => {
    open();
    // The first select is the kind picker.
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "adapter" },
    });
    fireEvent.change(screen.getByPlaceholderText("Jellyfin"), {
      target: { value: "Jellyfin" },
    });
    fireEvent.change(screen.getByPlaceholderText("http://jelly:8096"), {
      target: { value: "http://jelly:8096" },
    });
    submit();

    expect(await screen.findByText("Choose a service")).toBeInTheDocument();
    expect(createModule).not.toHaveBeenCalled();
  });

  it("creates a module scoped to a node", async () => {
    const onSaved = vi.fn();
    open({ onSaved });

    fireEvent.change(screen.getByPlaceholderText("Jellyfin"), {
      target: { value: "Missed an Ep" },
    });
    fireEvent.change(screen.getByPlaceholderText("http://jelly:3014"), {
      target: { value: "http://jelly:3014" },
    });
    fireEvent.change(screen.getByDisplayValue("Every node"), {
      target: { value: "jelly" },
    });
    submit();

    await waitFor(() => {
      expect(createModule).toHaveBeenCalledWith(
        expect.objectContaining({ id: "missed-an-ep", nodeId: "jelly" })
      );
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("locks the kind when opened for links only", () => {
    open({ fixedKind: "link" });
    expect(screen.getByRole("button", { name: "Add link" })).toBeInTheDocument();
    // No kind selector at all, because this entry point only makes links.
    expect(
      screen.queryByDisplayValue(/the service reports itself/)
    ).not.toBeInTheDocument();
  });

  it("offers icon and category for a link instead of a token", () => {
    open({ fixedKind: "link" });
    expect(screen.getByPlaceholderText("Media")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("optional")).not.toBeInTheDocument();
  });
});

describe("editing", () => {
  const existing = {
    id: "jellyfin",
    name: "Jellyfin",
    kind: "adapter",
    adapter: "jellyfin",
    url: "http://jelly:8096",
    hasToken: true,
    nodeId: null,
  };

  it("loads the module into the form", () => {
    open({ module: existing });
    expect(screen.getByText("Edit Jellyfin")).toBeInTheDocument();
    expect(screen.getByDisplayValue("http://jelly:8096")).toBeInTheDocument();
  });

  it("locks the id and the kind, since both are baked into channel names", () => {
    open({ module: existing });
    expect(screen.getByPlaceholderText("jellyfin")).toBeDisabled();
  });

  it("renames without touching the stored token", async () => {
    open({ module: existing });

    fireEvent.change(screen.getByDisplayValue("Jellyfin"), {
      target: { value: "Media Server" },
    });
    submit();

    await waitFor(() => {
      expect(updateModule).toHaveBeenCalledWith(
        "jellyfin",
        expect.objectContaining({ name: "Media Server" })
      );
    });
    expect(updateModule.mock.calls[0][1]).not.toHaveProperty("token");
  });

  it("sends a token only when one is typed", async () => {
    open({ module: existing });
    fireEvent.change(screen.getByPlaceholderText("unchanged"), {
      target: { value: "new-key" },
    });
    submit();

    await waitFor(() => {
      expect(updateModule).toHaveBeenCalledWith(
        "jellyfin",
        expect.objectContaining({ token: "new-key" })
      );
    });
  });

  it("can test the module from the dialog", async () => {
    open({ module: existing });
    fireEvent.click(screen.getByText("Test"));

    expect(await screen.findByText(/Reachable in 4ms/)).toBeInTheDocument();
    expect(testModule).toHaveBeenCalledWith("jellyfin");
  });

  it("removes only after confirmation", async () => {
    open({ module: existing });

    fireEvent.click(screen.getByTitle("Remove Jellyfin"));
    expect(deleteModule).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Remove"));
    await waitFor(() => expect(deleteModule).toHaveBeenCalledWith("jellyfin"));
  });

  it("offers no remove or test when creating", () => {
    open();
    expect(screen.queryByText("Test")).not.toBeInTheDocument();
    expect(screen.queryByTitle(/^Remove/)).not.toBeInTheDocument();
  });

  it("surfaces a server rejection", async () => {
    updateModule.mockRejectedValue(new Error("Name is required"));
    open({ module: existing });

    submit();
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
  });
});
