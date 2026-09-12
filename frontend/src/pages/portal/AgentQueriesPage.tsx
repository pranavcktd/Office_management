import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, extractErrorMessage } from "../../api/client";
import { QUERY_STATUS_LABELS } from "../../types";
import type { AgentPortalQuery, MasterCategory, QueryStatus } from "../../types";
import { formatDateTime } from "../../utils/date";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";
const labelClass = "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";

const STATUS_BADGE: Record<QueryStatus, string> = {
  OPEN: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  IN_PROGRESS: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  RESOLVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  CLOSED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export function AgentQueriesPage() {
  const [queries, setQueries] = useState<AgentPortalQuery[]>([]);
  const [categories, setCategories] = useState<MasterCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [serviceCategoryId, setServiceCategoryId] = useState<string>("");
  const [queryText, setQueryText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<AgentPortalQuery[]>("/agent-portal/queries");
      setQueries(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    api
      .get<MasterCategory[]>("/agent-portal/service-categories")
      .then(({ data }) => {
        setCategories(data);
        if (data.length) setServiceCategoryId(String(data[0].id));
      })
      .catch(() => undefined);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!serviceCategoryId) {
      setFormError("Pick a service category.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/agent-portal/queries", {
        serviceCategoryId: Number(serviceCategoryId),
        queryText,
      });
      setQueryText("");
      if (categories.length) setServiceCategoryId(String(categories[0].id));
      load();
    } catch (err) {
      setFormError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">My Queries</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Raise a new query or track existing ones</p>

      <form
        onSubmit={onSubmit}
        className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Raise a new query</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Service Category</label>
            <select
              className={inputClass}
              value={serviceCategoryId}
              onChange={(e) => setServiceCategoryId(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass}>Query</label>
          <textarea
            className={inputClass}
            rows={3}
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            required
          />
        </div>
        {formError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {formError}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit Query"}
        </button>
      </form>

      {error && (
        <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>
      )}

      <div className="mt-6 space-y-3">
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {!loading && queries.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">You haven't raised any queries yet.</p>
        )}
        {queries.map((q) => (
          <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {q.serviceCategory?.name ?? "—"}
              </span>
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[q.status]}`}>
                {QUERY_STATUS_LABELS[q.status]}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{q.queryText}</p>
            {q.responseText && (
              <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <span className="font-medium">Response: </span>
                {q.responseText}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-400">Raised {formatDateTime(q.createdAt)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
