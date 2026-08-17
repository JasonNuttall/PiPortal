import { useState, useCallback } from "react";
import { X, Trash2, Plus, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { createNode, updateNode, deleteNode, testNode } from "../api/api";

const EMPTY_FORM = { id: "", name: "", url: "", token: "" };

/** Mirrors the server's slug rule so the field can be corrected as it is typed. */
const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const NodeRow = ({ node, onDelete, onTest, testResult, busy }) => (
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
          <span className="text-[7px] tracking-[1.5px] uppercase text-crystal-blue border border-crystal-blue/30 px-1 py-0.5 rounded-sm">
            Token
          </span>
        )}
      </div>
      <p className="text-[9px] text-ctext-dim mt-0.5 truncate">
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
            onClick={() => onDelete(node.id)}
            title={`Remove ${node.name}`}
            className="p-1.5 rounded-sm text-red-400 hover:text-red-300 hover:bg-red-900/30 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  </div>
);

/**
 * Add, test and remove agents. The hub's own machine is always listed but
 * cannot be removed, since it is the process serving this page.
 */
const NodesModal = ({ nodes, onClose, onChanged }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testResults, setTestResults] = useState({});
  const [testing, setTesting] = useState({});

  const setField = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Derive an id from the name until the user edits the id directly.
      if (field === "name" && slugify(prev.name) === prev.id) {
        next.id = slugify(value);
      }
      if (field === "id") next.id = slugify(value);
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createNode({
        id: form.id,
        name: form.name.trim(),
        url: form.url.trim(),
        token: form.token.trim() || null,
      });
      setForm(EMPTY_FORM);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = useCallback(
    async (id) => {
      const node = nodes.find((n) => n.id === id);
      if (
        !window.confirm(
          `Remove ${node?.name ?? id} from the fleet? Its service links stay, but it will no longer be monitored.`
        )
      ) {
        return;
      }
      try {
        await deleteNode(id);
        onChanged();
      } catch (err) {
        setError(err.message);
      }
    },
    [nodes, onChanged]
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
        className="glass-card w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Manage nodes"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
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
              onDelete={handleDelete}
              onTest={handleTest}
              testResult={testResults[node.id]}
              busy={Boolean(testing[node.id])}
            />
          ))}
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-4 border-t border-glass-border space-y-3"
        >
          <h3 className="text-[9px] tracking-[3px] uppercase text-ctext-dim">
            Add an agent
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[9px] text-ctext-dim">Name</span>
              <input
                value={form.name}
                onChange={setField("name")}
                placeholder="Jelly"
                required
                className="glass-input w-full px-3 py-2 text-xs mt-1"
              />
            </label>
            <label className="block">
              <span className="text-[9px] text-ctext-dim">Id</span>
              <input
                value={form.id}
                onChange={setField("id")}
                placeholder="jelly"
                required
                className="glass-input w-full px-3 py-2 text-xs mt-1 font-source-code"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-[9px] text-ctext-dim">Agent URL</span>
            <input
              value={form.url}
              onChange={setField("url")}
              placeholder="http://jelly:3001"
              required
              className="glass-input w-full px-3 py-2 text-xs mt-1 font-source-code"
            />
          </label>

          <label className="block">
            <span className="text-[9px] text-ctext-dim">
              Token (only if the agent sets AGENT_TOKEN)
            </span>
            <input
              value={form.token}
              onChange={setField("token")}
              type="password"
              autoComplete="new-password"
              placeholder="optional"
              className="glass-input w-full px-3 py-2 text-xs mt-1 font-source-code"
            />
          </label>

          {error && (
            <p className="text-[10px] text-red-300 border border-red-500/30 rounded-sm px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="glass-pill text-xs text-crystal-blue border-crystal-blue/40 hover:bg-crystal-blue/15 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Add node
          </button>
        </form>
      </div>
    </div>
  );
};

export default NodesModal;
