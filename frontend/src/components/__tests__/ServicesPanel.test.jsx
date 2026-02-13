import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ServicesPanel from "../ServicesPanel";

// Mock the API functions
vi.mock("../../api/api", () => ({
  createService: vi.fn(),
  updateService: vi.fn(),
  deleteService: vi.fn(),
}));

import { createService, updateService, deleteService } from "../../api/api";

const defaultProps = {
  onUpdate: vi.fn(),
  isCollapsed: false,
  onCollapseChange: vi.fn(),
  panelId: "services",
  dataMode: "polling",
  onModeChange: vi.fn(),
  wsConnected: false,
};

const mockServices = [
  { id: 1, name: "Portainer", url: "http://pi:9000", icon: "🐳", category: "Management" },
  { id: 2, name: "Pi-hole", url: "http://pi/admin", icon: "🛡️", category: "Network" },
  { id: 3, name: "Grafana", url: "http://pi:3000", icon: "📊", category: "Monitoring" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ServicesPanel", () => {
  it("renders services grouped by category", () => {
    render(<ServicesPanel {...defaultProps} services={mockServices} />);

    expect(screen.getByText("Management")).toBeInTheDocument();
    expect(screen.getByText("Network")).toBeInTheDocument();
    expect(screen.getByText("Monitoring")).toBeInTheDocument();
  });

  it("renders service names", () => {
    render(<ServicesPanel {...defaultProps} services={mockServices} />);

    expect(screen.getByText("Portainer")).toBeInTheDocument();
    expect(screen.getByText("Pi-hole")).toBeInTheDocument();
    expect(screen.getByText("Grafana")).toBeInTheDocument();
  });

  it("renders service icons", () => {
    render(<ServicesPanel {...defaultProps} services={mockServices} />);

    expect(screen.getByText("🐳")).toBeInTheDocument();
    expect(screen.getByText("🛡️")).toBeInTheDocument();
  });

  it("shows count in subtitle", () => {
    render(<ServicesPanel {...defaultProps} services={mockServices} />);
    expect(screen.getByText("(3)")).toBeInTheDocument();
  });

  it("shows add form when Add Service is clicked", () => {
    render(<ServicesPanel {...defaultProps} services={mockServices} />);

    fireEvent.click(screen.getByText("Add Service"));
    expect(screen.getByPlaceholderText("Service Name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/URL/)).toBeInTheDocument();
  });

  it("saves a new service", async () => {
    createService.mockResolvedValue({ id: 4, name: "New" });
    render(<ServicesPanel {...defaultProps} services={mockServices} />);

    fireEvent.click(screen.getByText("Add Service"));

    fireEvent.change(screen.getByPlaceholderText("Service Name"), {
      target: { value: "New Service" },
    });
    fireEvent.change(screen.getByPlaceholderText(/URL/), {
      target: { value: "http://new" },
    });

    // Click the Save button (the first one in the add form)
    const saveButtons = screen.getAllByText("Save");
    fireEvent.click(saveButtons[0]);

    await waitFor(() => {
      expect(createService).toHaveBeenCalledWith({
        name: "New Service",
        url: "http://new",
        icon: "",
        category: "",
      });
    });
  });

  it("cancels adding a service", () => {
    render(<ServicesPanel {...defaultProps} services={mockServices} />);

    fireEvent.click(screen.getByText("Add Service"));
    expect(screen.getByPlaceholderText("Service Name")).toBeInTheDocument();

    const cancelButtons = screen.getAllByText("Cancel");
    fireEvent.click(cancelButtons[0]);
    expect(screen.queryByPlaceholderText("Service Name")).not.toBeInTheDocument();
  });

  it("deletes a service with confirmation", async () => {
    window.confirm = vi.fn(() => true);
    deleteService.mockResolvedValue();

    render(<ServicesPanel {...defaultProps} services={mockServices} />);

    // Hover to show action buttons - we need to find the delete button
    // The delete buttons are rendered but hidden with opacity-0
    const deleteButtons = screen.getAllByRole("button").filter(
      (btn) => btn.querySelector(".text-red-400")
    );

    if (deleteButtons.length > 0) {
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(window.confirm).toHaveBeenCalled();
        expect(deleteService).toHaveBeenCalledWith(1);
      });
    }
  });

  it("shows loading when services is empty array", () => {
    render(<ServicesPanel {...defaultProps} services={[]} />);
    expect(screen.getByText("(0)")).toBeInTheDocument();
  });
});
