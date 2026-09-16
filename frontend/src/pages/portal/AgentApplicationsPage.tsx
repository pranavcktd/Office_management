import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { Pagination } from "../../components/Pagination";
import { TrackingButton } from "../../components/TrackingButton";
import { CREDIT_STATUS_LABELS, REJECTION_LABELS, STATUS_LABELS } from "../../types";
import type { AgentPortalApplication, CreditStatus, FormStatus, PaginatedResponse } from "../../types";
import { formatDate, todayYyyyMmDd } from "../../utils/date";

const STATUS_BADGE: Record<FormStatus, string> = {
  AGENT_DRAFT: "bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300",
  UNDER_ENTRY: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  PUSHED_TO_NSDL: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  ACK_GENERATED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300",
};

const CREDIT_BADGE: Record<CreditStatus, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  TIME_BARRED: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  USED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export function AgentApplicationsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [apps, setApps] = useState<AgentPortalApplication[]>([]);
  const [moduleFilter, setModuleFilter] = useState<"" | "PAN" | "TAN">("");
  const [statusFilter, setStatusFilter] = useState<FormStatus | "">((searchParams.get("status") as FormStatus) || "");

  // A dashboard card can link here with ?status=... while this page is already mounted
  // (client-side navigation doesn't remount on a query-string-only change), so the filter
  // needs to react to that rather than only reading it once at first render.
  useEffect(() => {
    const s = searchParams.get("status") as FormStatus | null;
    setStatusFilter(s ?? "");
  }, [searchParams]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<PaginatedResponse<AgentPortalApplication>>("/agent-portal/applications", {
        params: {
          module: moduleFilter || undefined,
          status: statusFilter || undefined,
          dateFrom: fromDate || undefined,
          dateTo: toDate || undefined,
          q: search || undefined,
          page,
          pageSize,
        },
      });
      setApps(data.items);
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
  }, [moduleFilter, statusFilter, fromDate, toDate, search]);

  useEffect(() => {
    const timer = setTimeout(load, 250); // debounce keyword search
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleFilter, statusFilter, fromDate, toDate, search, page, pageSize]);

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">My Applications</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {total} record{total === 1 ? "" : "s"} you have submitted
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TrackingButton module="PAN" label="Track PAN" />
          <TrackingButton module="TAN" label="Track TAN" />
          <Link
            to="/portal/applications/pan/new"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            + New PAN Pre-Entry
          </Link>
          <Link
            to="/portal/applications/tan/new"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            + New TAN Pre-Entry
          </Link>
        </div>
      </div>
      <p className="mb-4 rounded-md bg-purple-50 px-3 py-2 text-sm text-purple-700 dark:bg-purple-950 dark:text-purple-300">
        Know some of the details before the physical form arrives? Start a pre-entry — the office will complete and
        finalize it once they receive the form. Nothing is required.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, mobile…"
            className="w-48 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Module</label>
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value as "" | "PAN" | "TAN")}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="">All</option>
            <option value="PAN">PAN</option>
            <option value="TAN">TAN</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FormStatus | "")}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="">All</option>
            {(Object.keys(STATUS_LABELS) as FormStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Received From</label>
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
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Module</th>
              <th className="px-4 py-3">Applicant</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Fee</th>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Credit Status</th>
              <th className="px-4 py-3">Acknowledgement</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-slate-500">Loading…</td>
              </tr>
            )}
            {!loading && apps.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-slate-500">No applications found.</td>
              </tr>
            )}
            {apps.map((a) => (
              <tr
                key={`${a.module}-${a.id}`}
                onClick={() => navigate(`/portal/applications/${a.module}/${a.id}`)}
                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">{a.module}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900 dark:text-slate-100">{a.applicantName}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{a.mobile}</div>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {a.applicationType === "NEW" ? "New" : "Correction"}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">₹{a.feeAmount}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(a.formReceivedDate)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[a.status]}`}>
                    {STATUS_LABELS[a.status]}
                    {a.status === "REJECTED" && a.rejectionReason ? ` · ${REJECTION_LABELS[a.rejectionReason]}` : ""}
                    {a.status === "REJECTED" && a.rejectionReason === "OTHER" && a.rejectionOtherDetail
                      ? ` (${a.rejectionOtherDetail})`
                      : ""}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {a.creditStatus ? (
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${CREDIT_BADGE[a.creditStatus]}`}>
                      {CREDIT_STATUS_LABELS[a.creditStatus]}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{a.ackNumber ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Link
                      to={`/portal/applications/${a.module}/${a.id}`}
                      onClick={(e) => e.stopPropagation()}
                      title="View"
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      👁
                    </Link>
                    {a.status === "AGENT_DRAFT" && (
                      <Link
                        to={`/portal/applications/${a.module.toLowerCase()}/${a.id}/edit`}
                        onClick={(e) => e.stopPropagation()}
                        title="Edit"
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                      >
                        ✏️
                      </Link>
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
