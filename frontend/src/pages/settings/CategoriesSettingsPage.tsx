import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, extractErrorMessage } from "../../api/client";
import { QUERY_EXTRA_FIELD_LABELS } from "../../types";
import type { MasterCategory, QueryExtraField } from "../../types";

const QUERY_EXTRA_FIELD_KEYS = Object.keys(QUERY_EXTRA_FIELD_LABELS) as QueryExtraField[];

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

const KINDS: { kind: "SERVICE" | "DISPATCH_ITEM"; label: string; hint: string }[] = [
  {
    kind: "SERVICE",
    label: "Client Query Service Categories",
    hint: "Shown when staff or agents raise a client query.",
  },
  {
    kind: "DISPATCH_ITEM",
    label: "Inward / Outward Item Types",
    hint: "Shown when logging an inward/outward register entry.",
  },
];

function CategoryList({ kind, label, hint }: { kind: "SERVICE" | "DISPATCH_ITEM"; label: string; hint: string }) {
  const [categories, setCategories] = useState<MasterCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<MasterCategory[]>(`/master/${kind}`, { params: { includeInactive: "true" } });
      setCategories(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await api.post(`/master/${kind}`, { name: newName.trim() });
      setNewName("");
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  function startEdit(c: MasterCategory) {
    setEditingId(c.id);
    setEditingName(c.name);
  }

  async function saveEdit(id: number) {
    if (!editingName.trim()) return;
    setError(null);
    try {
      await api.patch(`/master/${id}`, { name: editingName.trim() });
      setEditingId(null);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function toggleActive(c: MasterCategory) {
    setError(null);
    try {
      await api.patch(`/master/${c.id}`, { isActive: !c.isActive });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function onDelete(c: MasterCategory) {
    if (!window.confirm(`Delete "${c.name}"? This only works if it isn't used by any existing record.`)) return;
    setError(null);
    try {
      await api.delete(`/master/${c.id}`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function toggleRequiredField(c: MasterCategory, field: QueryExtraField) {
    setError(null);
    const current = c.requiredQueryFields ?? [];
    const next = current.includes(field) ? current.filter((f) => f !== field) : [...current, field];
    try {
      await api.patch(`/master/${c.id}`, { requiredQueryFields: next });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{label}</h2>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>

      <form onSubmit={onAdd} className="mt-4 flex gap-2">
        <input
          className={inputClass}
          placeholder="New category name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
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
        {!loading && categories.length === 0 && (
          <li className="py-3 text-sm text-slate-500">No categories yet.</li>
        )}
        {categories.map((c) => (
          <li key={c.id} className="py-2.5">
            <div className="flex items-center justify-between gap-3">
              {editingId === c.id ? (
                <input
                  autoFocus
                  className={inputClass}
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveEdit(c.id)}
                />
              ) : (
                <span
                  className={`text-sm ${c.isActive ? "text-slate-800 dark:text-slate-200" : "text-slate-400 line-through dark:text-slate-600"}`}
                >
                  {c.name}
                </span>
              )}
              <div className="flex shrink-0 items-center gap-1">
                {editingId === c.id ? (
                  <>
                    <button
                      onClick={() => saveEdit(c.id)}
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
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEdit(c)}
                      title="Rename"
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => toggleActive(c)}
                      title={c.isActive ? "Deactivate" : "Activate"}
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      {c.isActive ? "🚫" : "✅"}
                    </button>
                    <button
                      onClick={() => onDelete(c)}
                      title="Delete"
                      className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      🗑️
                    </button>
                  </>
                )}
              </div>
            </div>
            {kind === "SERVICE" && (
              <div className="mt-1.5 flex flex-wrap gap-3 pl-1">
                {QUERY_EXTRA_FIELD_KEYS.map((field) => (
                  <label key={field} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={(c.requiredQueryFields ?? []).includes(field)}
                      onChange={() => toggleRequiredField(c, field)}
                    />
                    Require {QUERY_EXTRA_FIELD_LABELS[field]}
                  </label>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CategoriesSettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Manage the category lists used across the app. Staff can also add a new category inline
        from any entry form; deactivate a category to hide it from new entries without breaking
        old records, or delete it once nothing references it.
      </p>
      {KINDS.map((k) => (
        <CategoryList key={k.kind} kind={k.kind} label={k.label} hint={k.hint} />
      ))}
    </div>
  );
}
