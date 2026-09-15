import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { ExportButtons } from "../../components/ExportButtons";
import { Pagination } from "../../components/Pagination";
import { QUERY_STATUS_LABELS } from "../../types";
import type { ClientQuery, MasterCategory, PaginatedResponse, QueryStatus } from "../../types";
import { formatDateTime, todayYyyyMmDd } from "../../utils/date";

const STATUS_BADGE: Record<QueryStatus, string> = {
  OPEN: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  IN_PROGRESS: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  RESOLVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  CLOSED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export function QueryListPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const isAuditor = user?.role === "AUDITOR";
  const [searchParams] = useSearchParams();

  const [queries, setQueries] = useState<ClientQuery[]>([]);
  const [status, setStatus] = useState<QueryStatus | "">((searchParams.get("status") as QueryStatus) || "");

  useEffect(() => {
    const s = searchParams.get("status") as QueryStatus | null;
    setStatus(s ?? "");
  }, [searchParams]);
  const [categories, setCategories] = useState<MasterCategory[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    api.get<MasterCategory[]>("/master/SERVICE").then(({ data }) => setCategories(data)).catch(() => undefined);
  }, []);

  const filterParams = {
    status: status || undefined,
    serviceCategoryId: categoryFilter || undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
    q: search || undefined,
  };

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<PaginatedResponse<ClientQuery>>("/queries", {
        params: { ...filterParams, page, pageSize },
      });
      setQueries(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, categoryFilter, fromDate, toDate, search]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, categoryFilter, fromDate, toDate, search, page, pageSize]);

  async function onDelete(id: number) {
    if (!window.confirm(`Delete query #${id}? This cannot be undone.`)) return;
    try {
      await api.delete(`/queries/${id}`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Client Queries</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {total} record{total === 1 ? "" : "s"}
          </p>
        </div>
        {!isAuditor && (
          <Link
            to="/queries/new"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            + New Query
          </Link>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Client, mobile, query…"
              className="w-56 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as QueryStatus | "")}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">All Status</option>
              {(Object.keys(QUERY_STATUS_LABELS) as QueryStatus[]).map((s) => (
                <option key={s} value={s}>
                  {QUERY_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Service</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">All Services</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">From</label>
            <input
              type="date"
              value={fromDate}
              max={toDate || todayYyyyMmDd()}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">To</label>
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          {(categoryFilter || fromDate || toDate) && (
            <button
              type="button"
              onClick={() => {
                setCategoryFilter("");
                setFromDate("");
                setToDate("");
              }}
              className="rounded-lg px-2 py-1.5 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Clear
            </button>
          )}
        </div>
        <ExportButtons exportPath="/queries/export" params={filterParams} />
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Query</th>
              <th className="px-4 py-3">Assigned To</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && queries.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  No queries found.
                </td>
              </tr>
            )}
            {queries.map((q) => (
              <tr key={q.id}>
                <td className="px-4 py-3 text-slate-500">#{q.id}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900 dark:text-slate-100">{q.clientName}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{q.mobile}</div>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {q.serviceCategory?.name ?? "—"}
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-slate-600 dark:text-slate-300">{q.queryText}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{q.assignedTo?.fullName ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[q.status]}`}>
                    {QUERY_STATUS_LABELS[q.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDateTime(q.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Link
                      to={`/queries/${q.id}`}
                      title="View"
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      👁
                    </Link>
                    {!isAuditor && (
                      <Link
                        to={`/queries/${q.id}/edit`}
                        title="Edit"
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                      >
                        ✏️
                      </Link>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => onDelete(q.id)}
                        title="Delete"
                        className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </div>
  );
}
