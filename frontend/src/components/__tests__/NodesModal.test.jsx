import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import NodesModal from "../NodesModal";

vi.mock("../../api/api", () => ({
  createNode: vi.fn().mockResolvedValue({}),
  updateNode: vi.fn().mockResolvedValue({}),
  deleteNode: vi.fn().mockResolvedValue(undefined),
  testNode: vi.fn().mockResolvedValue({ ok: true, latencyMs: 3 }),
  createModule: vi.fn().mockResolvedValue({}),
  deleteModule: vi.fn().mockResolvedValue(undefined),
  testModule: vi.fn().mockResolvedValue({ ok: true, latencyMs: 2 }),
  fetchAdapters: vi.fn().mockResolvedValue([{ id: "jellyfin", label: "Jellyfin" }]),
}));

import { createNode, updateNode, deleteNode, testNode } from "../../api/api";

const nodes = [
  { id: "pi5", name: "Raspberry Pi 5", isLocal: true, url: null, hasToken: false },
  {
    id: "jelly",
    name: "Jelly",
    isLocal: false,
    url: "http://jelly:3001",
    hasToken: true,
  },
];

const renderModal = (props = {}) =>
  render(
    <NodesModal
      nodes={nodes}
      onClose={vi.fn()}
      onChanged={vi.fn()}
      {...props}
    />
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listing", () => {
  it("lists every node", () => {
    renderModal();
    expect(screen.getByText("Raspberry Pi 5")).toBeInTheDocument();
    expect(screen.getByText("Jelly")).toBeInTheDocument();
  });

  it("marks the hub and does not offer to remove it", () => {
    renderModal();
    expect(screen.getByText("Hub")).toBeInTheDocument();
    expect(screen.queryByTitle("Remove Raspberry Pi 5")).not.toBeInTheDocument();
  });

  it("indicates a stored token without revealing it", () => {
    renderModal();
    const badge = screen.getByTitle("Authenticates with a stored token");
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).not.toMatch(/[a-z0-9]{8,}/);
  });

  it("explains how to add a machine when only the hub exists", () => {
    renderModal({ nodes: [nodes[0]] });
    expect(
      screen.getByText("Only this machine is being monitored.")
    ).toBeInTheDocument();
    expect(screen.getByText(/docker-compose.agent.yml/)).toBeInTheDocument();
  });
});

describe("adding", () => {
  it("derives the id from the name", () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText("Jelly"), {
      target: { value: "My NAS" },
    });
    expect(screen.getByPlaceholderText("jelly").value).toBe("my-nas");
  });

  it("rejects a non-http scheme before submitting", async () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText("Jelly"), {
      target: { value: "NAS" },
    });
    // "nas:3001" parses as a URL with scheme "nas:", so it is rejected on
    // protocol rather than on being malformed.
    fireEvent.change(screen.getByPlaceholderText("http://jelly:3001"), {
      target: { value: "nas:3001" },
    });
    fireEvent.click(screen.getByText("Add node"));

    expect(await screen.findByText("Must be http or https")).toBeInTheDocument();
    expect(createNode).not.toHaveBeenCalled();
  });

  it("rejects a malformed URL before submitting", async () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText("Jelly"), {
      target: { value: "NAS" },
    });
    fireEvent.change(screen.getByPlaceholderText("http://jelly:3001"), {
      target: { value: "not a url" },
    });
    fireEvent.click(screen.getByText("Add node"));

    expect(
      await screen.findByText("Not a valid URL — include http://")
    ).toBeInTheDocument();
    expect(createNode).not.toHaveBeenCalled();
  });

  it("requires a name", async () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText("http://jelly:3001"), {
      target: { value: "http://nas:3001" },
    });
    fireEvent.click(screen.getByText("Add node"));

    // Both name and id are empty, so each field reports it.
    expect((await screen.findAllByText("Required")).length).toBe(2);
    expect(createNode).not.toHaveBeenCalled();
  });

  it("creates a node", async () => {
    const onChanged = vi.fn();
    renderModal({ onChanged });

    fireEvent.change(screen.getByPlaceholderText("Jelly"), {
      target: { value: "NAS" },
    });
    fireEvent.change(screen.getByPlaceholderText("http://jelly:3001"), {
      target: { value: "http://nas:3001" },
    });
    fireEvent.click(screen.getByText("Add node"));

    await waitFor(() => {
      expect(createNode).toHaveBeenCalledWith(
        expect.objectContaining({ id: "nas", name: "NAS", url: "http://nas:3001" })
      );
      expect(onChanged).toHaveBeenCalled();
    });
  });

  it("surfaces a server rejection", async () => {
    createNode.mockRejectedValue(new Error("A node with that id already exists"));
    renderModal();

    fireEvent.change(screen.getByPlaceholderText("Jelly"), {
      target: { value: "Jelly" },
    });
    fireEvent.change(screen.getByPlaceholderText("http://jelly:3001"), {
      target: { value: "http://jelly:3001" },
    });
    fireEvent.click(screen.getByText("Add node"));

    expect(
      await screen.findByText("A node with that id already exists")
    ).toBeInTheDocument();
  });
});

describe("editing", () => {
  it("loads the node into the form", () => {
    renderModal();
    fireEvent.click(screen.getByTitle("Edit Jelly"));

    expect(screen.getByText("Edit jelly")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("http://jelly:3001").value).toBe(
      "http://jelly:3001"
    );
  });

  it("locks the id, since it is part of every channel name", () => {
    renderModal();
    fireEvent.click(screen.getByTitle("Edit Jelly"));
    expect(screen.getByPlaceholderText("jelly")).toBeDisabled();
  });

  it("updates the URL without touching the stored token", async () => {
    renderModal();
    fireEvent.click(screen.getByTitle("Edit Jelly"));

    fireEvent.change(screen.getByPlaceholderText("http://jelly:3001"), {
      target: { value: "http://10.0.0.9:3001" },
    });
    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => {
      expect(updateNode).toHaveBeenCalledWith("jelly", {
        name: "Jelly",
        url: "http://10.0.0.9:3001",
      });
    });
    // No token key at all, so the server keeps the existing secret.
    expect(updateNode.mock.calls[0][1]).not.toHaveProperty("token");
  });

  it("sends a token only when one is typed", async () => {
    renderModal();
    fireEvent.click(screen.getByTitle("Edit Jelly"));
    fireEvent.change(screen.getByPlaceholderText("unchanged"), {
      target: { value: "new-secret" },
    });
    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => {
      expect(updateNode).toHaveBeenCalledWith(
        "jelly",
        expect.objectContaining({ token: "new-secret" })
      );
    });
  });

  it("can cancel an edit", () => {
    renderModal();
    fireEvent.click(screen.getByTitle("Edit Jelly"));
    fireEvent.click(screen.getByText("Cancel edit"));

    expect(screen.getByText("Add an agent")).toBeInTheDocument();
  });
});

describe("removing", () => {
  it("requires confirmation", async () => {
    renderModal();

    fireEvent.click(screen.getByTitle("Remove Jelly"));
    expect(deleteNode).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Remove"));
    await waitFor(() => expect(deleteNode).toHaveBeenCalledWith("jelly"));
  });

  it("can be backed out of", () => {
    renderModal();
    fireEvent.click(screen.getByTitle("Remove Jelly"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(deleteNode).not.toHaveBeenCalled();
  });
});

describe("testing", () => {
  it("reports latency on success", async () => {
    renderModal();
    fireEvent.click(screen.getByText("Test"));
    expect(await screen.findByText("Reachable in 3ms")).toBeInTheDocument();
  });

  it("reports the failure reason", async () => {
    testNode.mockResolvedValue({ ok: false, error: "ECONNREFUSED" });
    renderModal();
    fireEvent.click(screen.getByText("Test"));
    expect(await screen.findByText("ECONNREFUSED")).toBeInTheDocument();
  });
});

describe("dialog behaviour", () => {
  it("closes on Escape", () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = renderModal({ onClose });

    fireEvent.click(container.firstChild);
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open when the dialog itself is clicked", () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("moves focus into the dialog", () => {
    renderModal();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });
});
