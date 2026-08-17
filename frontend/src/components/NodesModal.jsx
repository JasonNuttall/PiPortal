import { useState, useCallback } from "react";
import {
  X,
  Trash2,
  Plus,
  Pencil,
  Loader2,
  CheckCircle2,
  XCircle,
  ServerOff,
} from "lucide-react";
import { createNode, updateNode, deleteNode, testNode } from "../api/api";
import { useDialog } from "../hooks/useDialog";
import ConfirmButton from "./ConfirmButton";

const EMPTY_FORM = { id: "", name: "", url: "", token: "" };

/** Mirrors the server's slug rule so the field self-corrects as it is typed. */
const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** Same checks the server applies, so problems surface before submitting. */
const validate = ({ id, name, url }, { editing }) => {
  const errors = {};
  if (!name.trim()) errors.name = "Required";
  if (!editing && !id.trim()) errors.id = "Required";

  if (!url.trim()) {
    errors.url = "Required";
  } else {
    try {
      const parsed = new URL(url.trim());
      if (!["http:", "https:"].includes(parsed.protocol)) {
        errors.url = "Must be http or https";
      }
    } catch {
      errors.url = "Not a valid URL — include http://";
    }
  }
  return errors;
};

const Field = ({ label, hint, error, ...inputProps }) => (
  <label className="block">
    <span className="text-[9px] text-ctext-dim">{label}</span>
    <input
      {...inputProps}
      aria-invalid={Boolean(error)}
      className={`glass-input w-full px-3 py-2 text-xs mt-1 ${
        error ? "border-red-500/50" : ""
      } ${inputProps.className ?? ""}`}
    />
    {error ? (
      <span className="text-[9px] text-red-300 mt-0.5 block">{error}</span>
    ) : hint ? (
      <span className="text-[9px] text-ctext-dim mt-0.5 block">{hint}</span>
    ) : null}
  </label>
);

const NodeRow = ({ node, onEdit, onDelete, onTest, testResult, busy }) => (
  <div className="flex items-center justify-between gap-3 p-3 bg-glass border border-glass-border rounded-sm">
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-xs text-ctext font-medium truncate">
          {node.name}
        </span>
        {node.isLocal && (
          <span className="text-[7px] tracking-[1.5px] uppercase text-ctext-dim border border-glass-border px-1 py-0.5 rounded-sm">
            Hub
          </span>
        )}
        {node.hasToken && (
          <span
            title="Authenticates with a stored token"
            className="text-[7px] tracking-[1.5px] uppercase text-crystal-blue border border-crystal-blue/30 px-1 py-0.5 rounded-sm"
          >
            Token
          </span>
        )}
      </div>
      <p className="text-[9px] text-ctext-dim mt-0.5 truncate font-source-code">
        {node.isLocal ? "Collected in process" : node.url}
      </p>
      {testResult && (
        <p
          className={`text-[9px] mt-1 flex items-center gap-1 ${
            testResult.ok ? "text-crystal-blue" : "text-red-400"
          }`}
        >
          {testResult.ok ? (
            <>
              <CheckCircle2 className="w-3 h-3" />
              Reachable in {testResult.latencyMs}ms
            </>
          ) : (
            <>
              <XCircle className="w-3 h-3" />
              {testResult.error}
            </>
          )}
        </p>
      )}
    </div>

    <div className="flex items-center gap-1 shrink-0">
      {!node.isLocal && (
        <>
          <button
            type="button"
            onClick={() => onTest(node.id)}
            disabled={busy}
            className="glass-pill text-[9px] text-ctext-mid hover:text-ctext transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Test"}
          </button>
          <button
            type="button"
            onClick={() => onEdit(node)}
            title={`Edit ${node.name}`}
            className="p-1.5 rounded-sm text-crystal-blue hover:bg-crystal-blue/15 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <ConfirmButton
            onConfirm={() => onDelete(node.id)}
            title={`Remove ${node.name}`}
            confirmLabel="Remove"
            className="p-1.5 rounded-sm text-red-400 hover:text-red-300 hover:bg-red-900/30 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </ConfirmButton>
        </>
      )}
    </div>
  </div>
);

/**
 * Add, edit, test and remove agents. The hub's own machine is always listed
 * but cannot be removed, since it is the process serving this page.
 */
const NodesModal = ({ nodes, onClose, onChanged }) => {
  const dialogRef = useDialog(onClose);

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testResults, setTestResults] = useState({});
  const [testing, setTesting] = useState({});

  const editing = editingId !== null;
  const remoteNodes = nodes.filter((node) => !node.isLocal);

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

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setErrors({});
    setSubmitError(null);
  };

  const handleEdit = (node) => {
    // The token is never sent to the browser; leaving it blank keeps it.
    setForm({ id: node.id, name: node.name, url: node.url ?? "", token: "" });
    setEditingId(node.id);
    setErrors({});
    setSubmitError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const found = validate(form, { editing });
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    setSaving(true);
    setSubmitError(null);
    try {
      const payload = {
        name: form.name.trim(),
        url: form.url.trim(),
      };
      // Only send a token when one was typed, so an edit does not clear it.
      if (form.token.trim()) payload.token = form.token.trim();

      if (editing) {
        await updateNode(editingId, payload);
      } else {
        await createNode({ ...payload, id: form.id, token: form.token.trim() || null });
      }
      resetForm();
      onChanged();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = useCallback(
    async (id) => {
      try {
        await deleteNode(id);
        if (editingId === id) resetForm();
        onChanged();
      } catch (err) {
        setSubmitError(err.message);
      }
    },
    [onChanged, editingId]
  );

  const handleTest = useCallback(async (id) => {
    setTesting((prev) => ({ ...prev, [id]: true }));
    try {
      const result = await testNode(id);
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, error: err.message },
      }));
    } finally {
      setTesting((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="glass-card w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Manage nodes"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border sticky top-0 bg-glass backdrop-blur z-10">
          <h2 className="font-spectral italic text-base text-ctext">
            Manage Nodes
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ctext-dim hover:text-ctext transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-2">
          {nodes.map((node) => (
            <NodeRow
              key={node.id}
              node={node}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onTest={handleTest}
              testResult={testResults[node.id]}
              busy={Boolean(testing[node.id])}
            />
          ))}

          {remoteNodes.length === 0 && (
            <div className="text-center py-5 px-3 border border-dashed border-glass-border rounded-sm">
              <ServerOff className="w-5 h-5 mx-auto mb-2 text-ctext-dim" />
              <p className="text-[11px] text-ctext-mid">
                Only this machine is being monitored.
              </p>
              <p className="text-[9px] text-ctext-dim mt-1.5 leading-relaxed">
                Run the agent on another machine with
                <br />
                <code className="font-source-code text-crystal-blue">
                  docker compose -f docker-compose.agent.yml up -d
                </code>
                <br />
                then add it below.
              </p>
            </div>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-4 border-t border-glass-border space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-[9px] tracking-[3px] uppercase text-ctext-dim">
              {editing ? `Edit ${editingId}` : "Add an agent"}
            </h3>
            {editing && (
              <button
                type="button"
                onClick={resetForm}
                className="text-[9px] text-ctext-dim hover:text-ctext transition-colors"
              >
                Cancel edit
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Name"
              value={form.name}
              onChange={setField("name")}
              placeholder="Jelly"
              error={errors.name}
            />
            <Field
              label="Id"
              value={form.id}
              onChange={setField("id")}
              placeholder="jelly"
              // The id is part of every channel name, so it cannot change.
              disabled={editing}
              error={errors.id}
              hint={editing ? "Fixed after creation" : undefined}
              className="font-source-code disabled:opacity-50"
            />
          </div>

          <Field
            label="Agent URL"
            value={form.url}
            onChange={setField("url")}
            placeholder="http://jelly:3001"
            error={errors.url}
            hint="Must be reachable from the hub, not from your browser"
            className="font-source-code"
          />

          <Field
            label="Token"
            type="password"
            autoComplete="new-password"
            value={form.token}
            onChange={setField("token")}
            placeholder={editing ? "unchanged" : "optional"}
            hint={
              editing
                ? "Leave blank to keep the current token"
                : "Only if the agent sets AGENT_TOKEN"
            }
            className="font-source-code"
          />

          {submitError && (
            <p className="text-[10px] text-red-300 border border-red-500/30 rounded-sm px-3 py-2">
              {submitError}
            </p>
          )}

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
            {editing ? "Save changes" : "Add node"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default NodesModal;
