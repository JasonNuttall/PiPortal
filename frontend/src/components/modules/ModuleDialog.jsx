import { useState, useEffect, useCallback } from "react";
import { X, Loader2, Plus, Pencil, Trash2, CheckCircle2, XCircle } from "lucide-react";
import {
  createModule,
  updateModule,
  deleteModule,
  testModule,
  fetchAdapters,
} from "../../api/api";
import { useDialog } from "../../hooks/useDialog";
import ConfirmButton from "../ConfirmButton";

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const KIND_COPY = {
  native: {
    noun: "module",
    urlLabel: "Service URL",
    urlHint: "The portal appends /portal/module",
    placeholder: "http://jelly:3014",
  },
  adapter: {
    noun: "adapter",
    urlLabel: "Service URL",
    urlHint: "The service's own address",
    placeholder: "http://jelly:8096",
  },
  link: {
    noun: "link",
    urlLabel: "Link target",
    urlHint: "Opened in a new tab",
    placeholder: "http://jelly:9443",
  },
};

const Field = ({ label, hint, error, ...props }) => (
  <label className="block">
    <span className="text-[9px] text-ctext-dim">{label}</span>
    <input
      {...props}
      aria-invalid={Boolean(error)}
      className={`glass-input w-full px-3 py-2 text-xs mt-1 ${
        error ? "border-red-500/50" : ""
      } ${props.className ?? ""}`}
    />
    {error ? (
      <span className="text-[9px] text-red-300 mt-0.5 block">{error}</span>
    ) : hint ? (
      <span className="text-[9px] text-ctext-dim mt-0.5 block">{hint}</span>
    ) : null}
  </label>
);

/**
 * Add or edit a module, adapter or link.
 *
 * One dialog for all three because they are one registry — the differences are
 * wording and which fields apply, not separate concepts.
 *
 * @param {object|null} module - null to create
 * @param {string} [fixedKind] - lock the kind, e.g. the links panel only makes links
 */
const ModuleDialog = ({ module, fixedKind, nodes = [], onClose, onSaved }) => {
  const editing = Boolean(module);
  const ref = useDialog(onClose);

  const [form, setForm] = useState(() => ({
    id: module?.id ?? "",
    name: module?.name ?? "",
    kind: module?.kind ?? fixedKind ?? "native",
    adapter: module?.adapter ?? "",
    url: module?.url ?? "",
    icon: module?.icon ?? "",
    category: module?.category ?? "",
    nodeId: module?.nodeId ?? "",
    token: "",
  }));

  const [adapters, setAdapters] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [probe, setProbe] = useState(null);
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    if (form.kind !== "adapter") return;
    fetchAdapters()
      .then(setAdapters)
      .catch(() => setAdapters([]));
  }, [form.kind]);

  const copy = KIND_COPY[form.kind] ?? KIND_COPY.native;

  const setField = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Derive the id from the name until the id is edited directly.
      if (field === "name" && !editing && slugify(prev.name) === prev.id) {
        next.id = slugify(value);
      }
      if (field === "id") next.id = slugify(value);
      return next;
    });
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = () => {
    const found = {};
    if (!form.name.trim()) found.name = "Required";
    if (!editing && !form.id.trim()) found.id = "Required";
    if (form.kind === "adapter" && !form.adapter) found.adapter = "Choose a service";

    if (!form.url.trim()) {
      found.url = "Required";
    } else {
      try {
        const parsed = new URL(form.url.trim());
        if (!["http:", "https:"].includes(parsed.protocol)) {
          found.url = "Must be http or https";
        }
      } catch {
        found.url = "Not a valid URL — include http://";
      }
    }
    return found;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const found = validate();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    setSaving(true);
    setSubmitError(null);
    try {
      const payload = {
        name: form.name.trim(),
        kind: form.kind,
        adapter: form.kind === "adapter" ? form.adapter : null,
        url: form.url.trim(),
        icon: form.icon.trim() || null,
        category: form.category.trim() || null,
        nodeId: form.nodeId || null,
      };
      // Only send a token when one was typed, so editing does not wipe it.
      if (form.token.trim()) payload.token = form.token.trim();

      if (editing) {
        await updateModule(module.id, payload);
      } else {
        await createModule({ ...payload, id: form.id, token: form.token.trim() || null });
      }
      onSaved();
      onClose();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = useCallback(async () => {
    try {
      await deleteModule(module.id);
      onSaved();
      onClose();
    } catch (err) {
      setSubmitError(err.message);
    }
  }, [module, onSaved, onClose]);

  const handleTest = async () => {
    setProbing(true);
    try {
      setProbe(await testModule(module.id));
    } catch (err) {
      setProbe({ ok: false, error: err.message });
    } finally {
      setProbing(false);
    }
  };

  const title = editing
    ? `Edit ${module.name}`
    : `Add ${fixedKind ? copy.noun : "a module"}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <form
        ref={ref}
        onSubmit={handleSubmit}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="glass-card w-full max-w-md max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
          <h2 className="font-spectral italic text-base text-ctext truncate">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ctext-dim hover:text-ctext transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {!fixedKind && (
            <label className="block">
              <span className="text-[9px] text-ctext-dim">Kind</span>
              <select
                value={form.kind}
                onChange={setField("kind")}
                disabled={editing}
                className="glass-input w-full px-3 py-2 text-xs mt-1 disabled:opacity-50"
              >
                <option value="native">Module — the service reports itself</option>
                <option value="adapter">Adapter — the portal translates it</option>
                <option value="link">Link — just a shortcut</option>
              </select>
              {editing && (
                <span className="text-[9px] text-ctext-dim mt-0.5 block">
                  Fixed after creation
                </span>
              )}
            </label>
          )}

          {form.kind === "adapter" && (
            <label className="block">
              <span className="text-[9px] text-ctext-dim">Service</span>
              <select
                value={form.adapter}
                onChange={setField("adapter")}
                className="glass-input w-full px-3 py-2 text-xs mt-1"
              >
                <option value="">Choose a service…</option>
                {adapters.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
              {errors.adapter && (
                <span className="text-[9px] text-red-300 mt-0.5 block">
                  {errors.adapter}
                </span>
              )}
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Name"
              value={form.name}
              onChange={setField("name")}
              placeholder="Jellyfin"
              error={errors.name}
            />
            <Field
              label="Id"
              value={form.id}
              onChange={setField("id")}
              placeholder="jellyfin"
              disabled={editing}
              error={errors.id}
              hint={editing ? "Fixed after creation" : undefined}
              className="font-source-code disabled:opacity-50"
            />
          </div>

          <Field
            label={copy.urlLabel}
            value={form.url}
            onChange={setField("url")}
            placeholder={copy.placeholder}
            hint={copy.urlHint}
            error={errors.url}
            className="font-source-code"
          />

          {form.kind === "link" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Icon"
                value={form.icon}
                onChange={setField("icon")}
                placeholder="🎬"
              />
              <Field
                label="Category"
                value={form.category}
                onChange={setField("category")}
                placeholder="Media"
              />
            </div>
          ) : (
            <Field
              label="Token"
              type="password"
              autoComplete="new-password"
              value={form.token}
              onChange={setField("token")}
              placeholder={editing && module.hasToken ? "unchanged" : "optional"}
              hint={
                editing && module.hasToken
                  ? "Leave blank to keep the current token"
                  : form.kind === "adapter"
                    ? "The service's own API key"
                    : "Issued by the service for this portal"
              }
              className="font-source-code"
            />
          )}

          <label className="block">
            <span className="text-[9px] text-ctext-dim">Shown on</span>
            <select
              value={form.nodeId}
              onChange={setField("nodeId")}
              className="glass-input w-full px-3 py-2 text-xs mt-1"
            >
              <option value="">Every node</option>
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name} only
                </option>
              ))}
            </select>
          </label>

          {probe && (
            <p
              className={`text-[10px] flex items-center gap-1.5 ${
                probe.ok ? "text-crystal-blue" : "text-red-400"
              }`}
            >
              {probe.ok ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  Reachable in {probe.latencyMs}ms
                  {probe.info?.datasets
                    ? ` — ${probe.info.datasets.length} datasets`
                    : ""}
                </>
              ) : (
                <>
                  <XCircle className="w-3 h-3" />
                  {probe.error}
                </>
              )}
            </p>
          )}

          {submitError && (
            <p className="text-[10px] text-red-300 border border-red-500/30 rounded-sm px-3 py-2">
              {submitError}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-glass-border">
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="glass-pill text-xs text-crystal-blue border-crystal-blue/40 hover:bg-crystal-blue/15 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : editing ? (
                <Pencil className="w-3.5 h-3.5" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              {editing ? "Save changes" : `Add ${copy.noun}`}
            </button>

            {editing && form.kind !== "link" && (
              <button
                type="button"
                onClick={handleTest}
                disabled={probing}
                className="glass-pill text-[10px] text-ctext-mid hover:text-ctext transition-colors disabled:opacity-50"
              >
                {probing ? <Loader2 className="w-3 h-3 animate-spin" /> : "Test"}
              </button>
            )}
          </div>

          {editing && (
            <ConfirmButton
              onConfirm={handleDelete}
              title={`Remove ${module.name}`}
              confirmLabel="Remove"
              className="p-1.5 rounded-sm text-red-400 hover:text-red-300 hover:bg-red-900/30 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </ConfirmButton>
          )}
        </div>
      </form>
    </div>
  );
};

export default ModuleDialog;
