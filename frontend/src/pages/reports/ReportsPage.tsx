import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { ExportButtons } from "../../components/ExportButtons";
import { Pagination } from "../../components/Pagination";
import {
  CREDIT_STATUS_LABELS,
  REJECTION_LABELS,
} from "../../types";
import type {
  Agent,
  AdjustedReportRow,
  CreditStatus,
  DataEntryDiscrepancyRow,
  PaginatedResponse,
  RejectedReportRow,
  RejectionReason,
  ReportModule,
  Staff,
} from "../../types";
import { formatDate, formatDateTime, todayYyyyMmDd } from "../../utils/date";

type Tab = "rejected" | "adjusted" | "credit-status" | "data-entry-accuracy";

const TABS: { key: Tab; label: string }[] = [
  { key: "rejected", label: "Rejected Forms" },
  { key: "adjusted", label: "Adjusted Forms" },
  { key: "credit-status", label: "Adjustment Credit Status" },
  { key: "data-entry-accuracy", label: "Data Entry Accuracy" },
];

const CREDIT_BADGE: Record<CreditStatus, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  TIME_BARRED: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  USED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>("rejected");
  const [moduleFilter, setModuleFilter] = useState<ReportModule>("ALL");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentFilter, setAgentFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [rejectionReason, setRejectionReason] = useState<RejectionReason | "">("");
  const [creditStatus, setCreditStatus] = useState<CreditStatus | "">("");
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffFilter, setStaffFilter] = useState("");
  const [acknowledgedFilter, setAcknowledgedFilter] = useState<"" | "true" | "false">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [rejectedRows, setRejectedRows] = useState<RejectedReportRow[]>([]);
  const [adjustedRows, setAdjustedRows] = useState<AdjustedReportRow[]>([]);
  const [discrepancyRows, setDiscrepancyRows] = useState<DataEntryDiscrepancyRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<number | null>(null);

  useEffect(() => {
    api
      .get<Agent[]>("/agents", { params: { status: "ACTIVE" } })
      .then(({ data }) => setAgents(data))
      .catch(() => setAgents([]));
    api
      .get<Staff[]>("/staff")
      .then(({ data }) => setStaffList(data))
      .catch(() => setStaffList([]));
  }, []);

  const filterParams = {
    module: moduleFilter === "ALL" ? undefined : moduleFilter,
    agentId: agentFilter || undefined,
    dateFrom: fromDate || undefined,
    dateTo: toDate || undefined,
    rejectionReason: tab !== "adjusted" && tab !== "data-entry-accuracy" && rejectionReason ? rejectionReason : undefined,
    creditStatus: tab === "credit-status" && creditStatus ? creditStatus : undefined,
    staffId: tab === "data-entry-accuracy" && staffFilter ? staffFilter : undefined,
    acknowledged: tab === "data-entry-accuracy" && acknowledgedFilter ? acknowledgedFilter : undefined,
    q: search || undefined,
  };

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const endpoint =
        tab === "rejected"
          ? "/reports/rejected"
          : tab === "adjusted"
            ? "/reports/adjusted"
            : tab === "credit-status"
              ? "/reports/credit-status"
              : "/reports/discrepancies";
      if (tab === "adjusted") {
        const { data } = await api.get<PaginatedResponse<AdjustedReportRow>>(endpoint, {
          params: { ...filterParams, page, pageSize },
        });
        setAdjustedRows(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      } else if (tab === "data-entry-accuracy") {
        const { data } = await api.get<PaginatedResponse<DataEntryDiscrepancyRow>>(endpoint, {
          params: { ...filterParams, page, pageSize },
        });
        setDiscrepancyRows(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      } else {
        const { data } = await api.get<PaginatedResponse<RejectedReportRow>>(endpoint, {
          params: { ...filterParams, page, pageSize },
        });
        setRejectedRows(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function onAcknowledge(id: number) {
    setAcknowledgingId(id);
    try {
      await api.patch(`/reports/discrepancies/${id}/acknowledge`);
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setAcknowledgingId(null);
    }
  }

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, moduleFilter, agentFilter, fromDate, toDate, rejectionReason, creditStatus, staffFilter, acknowledgedFilter, search]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, moduleFilter, agentFilter, fromDate, toDate, rejectionReason, creditStatus, staffFilter, acknowledgedFilter, search, page, pageSize]);

  const exportPath =
    tab === "rejected"
      ? "/reports/rejected/export"
      : tab === "adjusted"
        ? "/reports/adjusted/export"
        : tab === "credit-status"
          ? "/reports/credit-status/export"
          : "/reports/discrepancies/export";

  return (
    <div className="px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Reports</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Rejected forms, adjustment history, and outstanding adjustment credits across PAN and TAN.
        </p>
      </div>

      <div className="mb-5 flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          {tab !== "data-entry-accuracy" && (
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Search</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, mobile, agent, Aadhaar…"
                className="w-48 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Module</label>
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value as ReportModule)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="ALL">PAN + TAN</option>
              <option value="PAN">PAN</option>
              <option value="TAN">TAN</option>
            </select>
          </div>
          {tab !== "data-entry-accuracy" && (
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Agent</label>
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">All (Office + Agents)</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.agentName}
                  </option>
                ))}
              </select>
            </div>
          )}
          {tab !== "adjusted" && tab !== "data-entry-accuracy" && (
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Rejection Reason</label>
              <select
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value as RejectionReason | "")}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">All Reasons</option>
                {(Object.keys(REJECTION_LABELS) as RejectionReason[]).map((r) => (
                  <option key={r} value={r}>
                    {REJECTION_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
          )}
          {tab === "credit-status" && (
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Credit Status</label>
              <select
                value={creditStatus}
                onChange={(e) => setCreditStatus(e.target.value as CreditStatus | "")}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">All</option>
                {(Object.keys(CREDIT_STATUS_LABELS) as CreditStatus[]).map((c) => (
                  <option key={c} value={c}>
                    {CREDIT_STATUS_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          )}
          {tab === "data-entry-accuracy" && (
            <>
              <div>
                <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Staff</label>
                <select
                  value={staffFilter}
                  onChange={(e) => setStaffFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">All Staff</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Status</label>
                <select
                  value={acknowledgedFilter}
                  onChange={(e) => setAcknowledgedFilter(e.target.value as "" | "true" | "false")}
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">All</option>
                  <option value="false">Needs Review</option>
                  <option value="true">Acknowledged</option>
                </select>
              </div>
            </>
          )}
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
              {tab === "adjusted" ? "Adjusted From" : tab === "data-entry-accuracy" ? "Detected From" : "Rejected From"}
            </label>
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
        <ExportButtons exportPath={exportPath} params={filterParams} />
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {tab === "adjusted" ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">New Applicant</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Adjusted Date</th>
                <th className="px-4 py-3">Original (Rejected) Form</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && adjustedRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    No adjusted forms found.
                  </td>
                </tr>
              )}
              {adjustedRows.map((r) => (
                <tr key={`${r.module}-${r.id}`}>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.module}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{r.applicantName}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{r.mobile}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.agentName ?? "Office"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDateTime(r.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {r.originalId ? (
                      <Link
                        to={`/${r.module.toLowerCase()}/${r.originalId}`}
                        className="text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        #{r.originalId} — {r.originalApplicantName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/${r.module.toLowerCase()}/${r.id}`}
                      title="View"
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      👁
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === "data-entry-accuracy" ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">Application</th>
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Field</th>
                <th className="px-4 py-3">Entered by Staff</th>
                <th className="px-4 py-3">Per Protean Report</th>
                <th className="px-4 py-3">Detected</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && discrepancyRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                    No data entry discrepancies found.
                  </td>
                </tr>
              )}
              {discrepancyRows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.module}</td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/${r.module.toLowerCase()}/${r.applicationId}`}
                      className="text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      #{r.applicationId}
                    </Link>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Ack {r.ackNumber}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.staffName ?? "Unknown"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.fieldLabel}</td>
                  <td className="px-4 py-3 text-red-700 dark:text-red-400">{r.enteredValue ?? "—"}</td>
                  <td className="px-4 py-3 text-emerald-700 dark:text-emerald-400">{r.reportValue ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDateTime(r.detectedAt)}</td>
                  <td className="px-4 py-3">
                    {r.acknowledged ? (
                      <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        Acknowledged{r.acknowledgedByName ? ` by ${r.acknowledgedByName}` : ""}
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
                        Needs Review
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!r.acknowledged && (
                      <button
                        onClick={() => onAcknowledge(r.id)}
                        disabled={acknowledgingId === r.id}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {acknowledgingId === r.id ? "…" : "Mark Reviewed"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">Applicant</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Rejection Reason</th>
                <th className="px-4 py-3">Rejection Date</th>
                <th className="px-4 py-3">Credit Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && rejectedRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    No records found.
                  </td>
                </tr>
              )}
              {rejectedRows.map((r) => (
                <tr key={`${r.module}-${r.id}`}>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.module}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{r.applicantName}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{r.mobile}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.agentName ?? "Office"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {r.rejectionReason ? REJECTION_LABELS[r.rejectionReason] : "—"}
                    {r.rejectionReason === "OTHER" && r.rejectionOtherDetail ? ` (${r.rejectionOtherDetail})` : ""}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(r.rejectionDate)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${CREDIT_BADGE[r.creditStatus]}`}>
                      {CREDIT_STATUS_LABELS[r.creditStatus]}
                    </span>
                    {r.creditStatus === "TIME_BARRED" && r.adjustmentExpiredAt && (
                      <span className="ml-1 block text-xs text-slate-500 dark:text-slate-400">
                        on {formatDate(r.adjustmentExpiredAt)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/${r.module.toLowerCase()}/${r.id}`}
                      title="View"
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      👁
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
