import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, extractErrorMessage } from "../../api/client";
import type { TrackingLink, TrackingLinkModule } from "../../types";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

const MODULES: { module: TrackingLinkModule; label: string; hint: string }[] = [
  {
    module: "PAN",
    label: "Track PAN Application",
    hint: "The URL the \"Track PAN Application\" button opens for staff/agents. Usually just one link — Protean's public PAN/TAN status tracker, for example.",
  },
  {
    module: "TAN",
    label: "Track TAN Application",
    hint: "Same idea as PAN — usually the same status-tracker URL, kept separate in case it ever needs to differ.",
  },
  {
    module: "DISPATCH",
    label: "Inward / Outward — Courier Tracking",
    hint: "Add one link per courier (India Post, DTDC, ...). The \"Track\" button on Inward/Outward shows a dropdown of these; the user picks the courier, then enters the docket number on the destination site.",
  },
];

function TrackingLinkList({ module, label, hint }: { module: TrackingLinkModule; label: string; hint: string }) {
  const [links, setLinks] = useState<TrackingLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editUrl, setEditUrl] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<TrackingLink[]>(`/tracking-links/${module}`, { params: { includeInactive: "true" } });
      setLinks(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!newLabel.trim() || !newUrl.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await api.post(`/tracking-links/${module}`, { label: newLabel.trim(), url: newUrl.trim() });
      setNewLabel("");
      setNewUrl("");
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  function startEdit(l: TrackingLink) {
    setEditingId(l.id);
    setEditLabel(l.label);
    setEditUrl(l.url);
  }

  async function saveEdit(id: number) {
    if (!editLabel.trim() || !editUrl.trim()) return;
    setError(null);
    try {
      await api.patch(`/tracking-links/${id}`, { label: editLabel.trim(), url: editUrl.trim() });
      setEditingId(null);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function toggleActive(l: TrackingLink) {
    setError(null);
    try {
      await api.patch(`/tracking-links/${l.id}`, { isActive: !l.isActive });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function onDelete(l: TrackingLink) {
    if (!window.confirm(`Delete "${l.label}"?`)) return;
    setError(null);
    try {
      await api.delete(`/tracking-links/${l.id}`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{label}</h2>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>

      <form onSubmit={onAdd} className="mt-4 flex flex-wrap gap-2">
        <input
          className={`${inputClass} w-48`}
          placeholder={module === "DISPATCH" ? "Courier name (e.g. India Post)" : "Label"}
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <input
          className={`${inputClass} flex-1`}
          placeholder="https://…"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
        />
        <button
          type="submit"
          disabled={adding}
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {adding ? "Adding…" : "+ Add"}
        </button>
      </form>

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
        {loading && <li className="py-3 text-sm text-slate-500">Loading…</li>}
        {!loading && links.length === 0 && (
          <li className="py-3 text-sm text-slate-500">No tracking link configured yet — the button won't show until one is added.</li>
        )}
        {links.map((l) => (
          <li key={l.id} className="py-2.5">
            {editingId === l.id ? (
              <div className="flex flex-wrap gap-2">
                <input
                  autoFocus
                  className={`${inputClass} w-48`}
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                />
                <input
                  className={`${inputClass} flex-1`}
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                />
                <button
                  onClick={() => saveEdit(l.id)}
                  className="rounded px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className={`text-sm ${l.isActive ? "text-slate-800 dark:text-slate-200" : "text-slate-400 line-through dark:text-slate-600"}`}>
                    {l.label}
                  </span>
                  <div className="truncate text-xs text-slate-500 dark:text-slate-400">{l.url}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => startEdit(l)}
                    title="Edit"
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => toggleActive(l)}
                    title={l.isActive ? "Deactivate" : "Activate"}
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    {l.isActive ? "🚫" : "✅"}
                  </button>
                  <button
                    onClick={() => onDelete(l)}
                    title="Delete"
                    className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TrackingLinksSettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        External tracking links shown as buttons on PAN/TAN and Inward/Outward — editing a URL
        here takes effect immediately, no code change or deploy needed.
      </p>
      {MODULES.map((m) => (
        <TrackingLinkList key={m.module} module={m.module} label={m.label} hint={m.hint} />
      ))}
    </div>
  );
}
