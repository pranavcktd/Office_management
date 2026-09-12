import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { ExportButtons } from "../../components/ExportButtons";
import { Pagination } from "../../components/Pagination";
import { COURIER_AGENCY_LABELS } from "../../types";
import type { DispatchEntry, DispatchEntryType, MasterCategory, PaginatedResponse } from "../../types";
import { formatDateTime } from "../../utils/date";

export function DispatchListPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [entries, setEntries] = useState<DispatchEntry[]>([]);
  const [itemCategories, setItemCategories] = useState<MasterCategory[]>([]);
  const [entryType, setEntryType] = useState<DispatchEntryType | "">("");
  const [itemCategoryId, setItemCategoryId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    api.get<MasterCategory[]>("/master/DISPATCH_ITEM").then(({ data }) => setItemCategories(data)).catch(() => undefined);
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<PaginatedResponse<DispatchEntry>>("/dispatch", {
        params: {
          entryType: entryType || undefined,
          itemCategoryId: itemCategoryId || undefined,
          q: search || undefined,
          page,
          pageSize,
        },
      });
      setEntries(data.items);
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
  }, [entryType, itemCategoryId, search]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryType, itemCategoryId, search, page, pageSize]);

  async function onDelete(id: number) {
    if (!window.confirm(`Delete register entry #${id}? This cannot be undone.`)) return;
    try {
      await api.delete(`/dispatch/${id}`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Inward / Outward Register
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {total} record{total === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          to="/dispatch/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          + New Entry
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search party, consignment #…"
            className="w-64 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <select
            value={entryType}
            onChange={(e) => setEntryType(e.target.value as DispatchEntryType | "")}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="">All Types</option>
            <option value="INWARD">Inward</option>
            <option value="OUTWARD">Outward</option>
          </select>
          <select
            value={itemCategoryId}
            onChange={(e) => setItemCategoryId(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="">All Items</option>
            {itemCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <ExportButtons
          exportPath="/dispatch/export"
          params={{ entryType: entryType || undefined, itemCategoryId: itemCategoryId || undefined, q: search || undefined }}
        />
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
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Courier</th>
              <th className="px-4 py-3">Consignment #</th>
              <th className="px-4 py-3">Party</th>
              <th className="px-4 py-3">Mobile</th>
              <th className="px-4 py-3">Handled By</th>
              <th className="px-4 py-3">Date & Time</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-slate-500">
                  No entries found.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 text-slate-500">#{e.id}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      e.entryType === "INWARD"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                        : "bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300"
                    }`}
                  >
                    {e.entryType === "INWARD" ? "Inward" : "Outward"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {e.itemCategory?.name ?? "—"}
                  {e.receiptPath ? <span className="ml-1" title="Receipt attached">📎</span> : null}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {e.courierAgency
                    ? e.courierAgency === "OTHER" && e.courierOtherDetail
                      ? e.courierOtherDetail
                      : COURIER_AGENCY_LABELS[e.courierAgency]
                    : "—"}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{e.consignmentNumber ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{e.partyDetails}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{e.mobile ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{e.handledBy.fullName}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDateTime(e.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Link
                      to={`/dispatch/${e.id}`}
                      title="View"
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      👁
                    </Link>
                    {isAdmin && (
                      <>
                        <Link
                          to={`/dispatch/${e.id}/edit`}
                          title="Edit"
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          ✏️
                        </Link>
                        <button
                          onClick={() => onDelete(e.id)}
                          title="Delete"
                          className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                        >
                          🗑
                        </button>
                      </>
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
