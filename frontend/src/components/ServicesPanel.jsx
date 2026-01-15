import { useState } from "react";
import {
  Link,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { createService, updateService, deleteService } from "../api/api";

const ServicesPanel = ({ services, onUpdate }) => {
  const [editingService, setEditingService] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
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

  const groupedServices = services.reduce((acc, service) => {
    const category = service.category || "Other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(service);
    return acc;
  }, {});

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700">
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div
            className="flex items-center gap-2 cursor-pointer hover:text-slate-300"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            <Link className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-bold text-slate-100">Quick Links</h2>
            <span className="text-sm text-slate-400">({services.length})</span>
            {isCollapsed ? (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            )}
          </div>
          {!isCollapsed && (
            <button
              onClick={handleAdd}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Service
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-6">
          {isAdding && (
            <div className="bg-slate-700/50 rounded-lg p-4 mb-4">
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Service Name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full bg-slate-600 text-slate-100 px-3 py-2 rounded border border-slate-500 focus:border-blue-500 outline-none"
                />
                <input
                  type="text"
                  placeholder="URL (e.g., http://raspberrypi:8080)"
                  value={formData.url}
                  onChange={(e) =>
                    setFormData({ ...formData, url: e.target.value })
                  }
                  className="w-full bg-slate-600 text-slate-100 px-3 py-2 rounded border border-slate-500 focus:border-blue-500 outline-none"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Icon (emoji)"
                    value={formData.icon}
                    onChange={(e) =>
                      setFormData({ ...formData, icon: e.target.value })
                    }
                    className="bg-slate-600 text-slate-100 px-3 py-2 rounded border border-slate-500 focus:border-blue-500 outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Category"
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    className="bg-slate-600 text-slate-100 px-3 py-2 rounded border border-slate-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm"
                  >
                    <Save className="w-4 h-4" />
                    Save
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm"
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
                <h3 className="text-sm font-semibold text-slate-400 mb-3">
                  {category}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {categoryServices.map((service) => (
                    <div key={service.id}>
                      {editingService === service.id ? (
                        <div className="bg-slate-700/50 rounded-lg p-3">
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
                              className="w-full bg-slate-600 text-slate-100 px-2 py-1 rounded text-sm border border-slate-500 outline-none"
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
                              className="w-full bg-slate-600 text-slate-100 px-2 py-1 rounded text-sm border border-slate-500 outline-none"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={handleSave}
                                className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs"
                              >
                                <Save className="w-3 h-3" />
                              </button>
                              <button
                                onClick={handleCancel}
                                className="flex items-center gap-1 px-2 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded text-xs"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <a
                          href={service.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block bg-slate-700/50 hover:bg-slate-700 rounded-lg p-4 transition-colors group"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">
                                {service.icon || "🔗"}
                              </span>
                              <div>
                                <h4 className="font-semibold text-slate-100 group-hover:text-blue-400 transition-colors">
                                  {service.name}
                                </h4>
                                <p className="text-xs text-slate-400">
                                  {service.url}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleEdit(service);
                                }}
                                className="p-1.5 bg-slate-600 hover:bg-slate-500 rounded text-slate-300"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleDelete(service.id);
                                }}
                                className="p-1.5 bg-red-600 hover:bg-red-700 rounded text-white"
                              >
                                <Trash2 className="w-3 h-3" />
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

          {services.length === 0 && !isAdding && (
            <p className="text-slate-400 text-center py-8">
              No services configured. Click "Add Service" to get started.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ServicesPanel;
