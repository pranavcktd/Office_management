import { useEffect, useState } from "react";
import { api, extractErrorMessage } from "../../api/client";
import type { AuditEntry } from "../../types";
import { formatDateTime } from "../../utils/date";

const inputClass =
  "rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white";

export function AuditTrailPage() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [actorKind, setActorKind] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ items: AuditEntry[]; nextCursor: number | null }>("/audit", {
        params: {
          actorKind: actorKind || undefined,
          entityType: entityType || undefined,
          action: action || undefined,
          q: q || undefined,
        },
      });
      setItems(data.items);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const { data } = await api.get<{ items: AuditEntry[]; nextCursor: number | null }>("/audit", {
        params: {
          actorKind: actorKind || undefined,
          entityType: entityType || undefined,
          action: action || undefined,
          q: q || undefined,
          cursor: nextCursor,
        },
      });
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    load();
  }

  return (
    <div className="px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Audit Trail</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Every tracked action across staff, agents, and the system.
        </p>
      </div>

      <form onSubmit={onFilterSubmit} className="mb-4 flex flex-wrap items-center gap-3">
        <select value={actorKind} onChange={(e) => setActorKind(e.target.value)} className={inputClass}>
          <option value="">All actors</option>
          <option value="staff">Staff</option>
          <option value="agent">Agent</option>
          <option value="system">System</option>
        </select>
        <input
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          placeholder="Entity type (e.g. pan_applications)"
          className={inputClass}
        />
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Action contains…"
          className={inputClass}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search actor/action/entity…"
          className={`${inputClass} w-56`}
        />
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Filter
        </button>
      </form>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No activity found.
                </td>
              </tr>
            )}
            {items.map((it) => (
              <tr key={it.id}>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                  {formatDateTime(it.createdAt)}
                </td>
                <td className="px-4 py-3 text-slate-800 dark:text-slate-200">
                  {it.actorName ?? "—"}
                  <span className="ml-1 text-xs text-slate-400">({it.actorKind})</span>
                </td>
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{it.action}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {it.entityType} #{it.entityId}
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                  {it.meta ? JSON.stringify(it.meta) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
