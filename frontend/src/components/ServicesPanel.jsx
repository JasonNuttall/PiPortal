import { useState } from "react";
import {
  Link,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
} from "lucide-react";
import { createService, updateService, deleteService } from "../api/api";
import BasePanel from "./BasePanel";

const ServicesPanel = ({
  services,
  onUpdate,
  isCollapsed,
  onCollapseChange,
  panelId,
  dataMode,
  onModeChange,
  wsConnected,
}) => {
  const [editingService, setEditingService] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    icon: "",
    category: "",
  });

  const handleEdit = (service) => {
    setEditingService(service.id);
    setFormData(service);
    setIsAdding(false);
  };

  const handleAdd = () => {
    setIsAdding(true);
    setEditingService(null);
    setFormData({ name: "", url: "", icon: "", category: "" });
  };

  const handleSave = async () => {
    try {
      if (editingService) {
        await updateService(editingService, formData);
      } else {
        await createService(formData);
      }
      setEditingService(null);
      setIsAdding(false);
      setFormData({ name: "", url: "", icon: "", category: "" });
      onUpdate();
    } catch (error) {
      console.error("Failed to save service:", error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this service?")) {
      try {
        await deleteService(id);
        onUpdate();
      } catch (error) {
        console.error("Failed to delete service:", error);
      }
    }
  };

  const handleCancel = () => {
    setEditingService(null);
    setIsAdding(false);
    setFormData({ name: "", url: "", icon: "", category: "" });
  };

  const groupedServices = (services || []).reduce((acc, service) => {
    const category = service.category || "Other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(service);
    return acc;
  }, {});

  const addButton = (
    <button
      onClick={handleAdd}
      className="flex items-center gap-1.5 px-2.5 py-1 bg-crystal-blue/15 hover:bg-crystal-blue/25 text-crystal-blue border border-crystal-blue/30 rounded-sm text-xs font-medium transition-colors"
    >
      <Plus className="w-3.5 h-3.5" />
      Add Service
    </button>
  );

  return (
    <BasePanel
      title="Quick Links"
      icon={Link}
      iconColor="text-crystal-blue"
      data={services}
      isCollapsed={isCollapsed}
      onCollapseChange={onCollapseChange}
      subtitle={`(${services?.length || 0})`}
      headerActions={addButton}
      panelId={panelId}
      dataMode={dataMode}
      onModeChange={onModeChange}
      wsConnected={wsConnected}
    >
      {(data) => (
        <>
          {isAdding && (
            <div className="bg-glass border border-glass-border rounded-sm p-4 mb-4">
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Service Name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="glass-input w-full"
                />
                <input
                  type="text"
                  placeholder="URL (e.g., http://raspberrypi:8080)"
                  value={formData.url}
                  onChange={(e) =>
                    setFormData({ ...formData, url: e.target.value })
                  }
                  className="glass-input w-full"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Icon (emoji)"
                    value={formData.icon}
                    onChange={(e) =>
                      setFormData({ ...formData, icon: e.target.value })
                    }
                    className="glass-input"
                  />
                  <input
                    type="text"
                    placeholder="Category"
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    className="glass-input"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-1 px-3 py-1.5 bg-crystal-teal/20 hover:bg-crystal-teal/30 text-crystal-teal border border-crystal-teal/30 rounded-sm text-sm transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    Save
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex items-center gap-1 px-3 py-1.5 bg-glass hover:bg-glass-hover text-ctext-mid border border-glass-border rounded-sm text-sm transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {Object.entries(groupedServices).map(
            ([category, categoryServices]) => (
              <div key={category} className="mb-6 last:mb-0">
                <h3 className="text-[8px] tracking-[2px] uppercase font-source-code text-ctext-dim mb-3">
                  {category}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {categoryServices.map((service) => (
                    <div key={service.id}>
                      {editingService === service.id ? (
                        <div className="bg-glass border border-glass-border rounded-sm p-3">
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={formData.name}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  name: e.target.value,
                                })
                              }
                              className="glass-input w-full text-sm"
                            />
                            <input
                              type="text"
                              value={formData.url}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  url: e.target.value,
                                })
                              }
                              className="glass-input w-full text-sm"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={formData.icon}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    icon: e.target.value,
                                  })
                                }
                                className="glass-input text-sm"
                              />
                              <input
                                type="text"
                                value={formData.category}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    category: e.target.value,
                                  })
                                }
                                className="glass-input text-sm"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={handleSave}
                                className="flex items-center gap-1 px-2 py-1 bg-crystal-teal/20 hover:bg-crystal-teal/30 text-crystal-teal border border-crystal-teal/30 rounded-sm text-xs transition-colors"
                              >
                                <Save className="w-3 h-3" />
                                Save
                              </button>
                              <button
                                onClick={handleCancel}
                                className="flex items-center gap-1 px-2 py-1 bg-glass hover:bg-glass-hover text-ctext-mid border border-glass-border rounded-sm text-xs transition-colors"
                              >
                                <X className="w-3 h-3" />
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <a
                          href={service.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block bg-glass hover:bg-glass-hover border border-glass-border hover:border-glass-border-hover rounded-sm p-3 transition-colors group"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-xl">
                                {service.icon || "\uD83D\uDD17"}
                              </span>
                              <span className="text-ctext font-medium group-hover:text-crystal-blue transition-colors">
                                {service.name}
                              </span>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleEdit(service);
                                }}
                                className="p-1 hover:bg-glass-hover rounded-sm"
                              >
                                <Pencil className="w-3 h-3 text-crystal-blue" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleDelete(service.id);
                                }}
                                className="p-1 hover:bg-red-900/30 rounded-sm"
                              >
                                <Trash2 className="w-3 h-3 text-red-400" />
                              </button>
                            </div>
                          </div>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </>
      )}
    </BasePanel>
  );
};

export default ServicesPanel;
