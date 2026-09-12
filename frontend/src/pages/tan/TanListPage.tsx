import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { BulkImportModal } from "../../components/BulkImportModal";
import { DateInput } from "../../components/DateInput";
import { ExportButtons } from "../../components/ExportButtons";
import { Pagination } from "../../components/Pagination";
import { ImportAckModal } from "../pan/ImportAckModal";
import { APPLICANT_CATEGORY_LABELS, REJECTION_LABELS, STATUS_LABELS } from "../../types";
import type { Agent, ApplicantCategory, FormStatus, PaginatedResponse, RejectionReason, TanApplication } from "../../types";
import { todayDdMmYyyy, todayYyyyMmDd } from "../../utils/date";
import { getTanFormNumber } from "../../utils/formNumbers";

const STATUS_BADGE: Record<FormStatus, string> = {
  AGENT_DRAFT: "bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300",
  UNDER_ENTRY: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  PUSHED_TO_NSDL: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  ACK_GENERATED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300",
};

const ALL_STATUSES = Object.keys(STATUS_LABELS) as FormStatus[];
// AGENT_DRAFT is never a manually-picked target — a draft is finalized by editing/saving it
// (see updateTan's auto-promote logic), not by choosing it from this quick status dropdown.
const EDITABLE_STATUSES = ALL_STATUSES.filter((s) => s !== "AGENT_DRAFT");

function StatusCell({ app, onUpdated }: { app: TanApplication; onUpdated: () => void }) {
  const [pendingStatus, setPendingStatus] = useState<FormStatus>(app.status);
  const [rejectionReason, setRejectionReason] = useState<RejectionReason>("DATA_INCOMPLETE");
  const [rejectionOtherDetail, setRejectionOtherDetail] = useState("");
  const [rejectionDate, setRejectionDate] = useState(todayDdMmYyyy());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = pendingStatus !== app.status;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/tan/${app.id}/status`, {
        status: pendingStatus,
        rejectionReason: pendingStatus === "REJECTED" ? rejectionReason : undefined,
        rejectionOtherDetail:
          pendingStatus === "REJECTED" && rejectionReason === "OTHER" ? rejectionOtherDetail : undefined,
        rejectionDate: pendingStatus === "REJECTED" ? rejectionDate : undefined,
      });
      onUpdated();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <span
        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[app.status]}`}
      >
        {STATUS_LABELS[app.status]}
        {app.status === "REJECTED" && app.rejectionReason && ` · ${REJECTION_LABELS[app.rejectionReason]}`}
        {app.status === "REJECTED" && app.rejectionReason === "OTHER" && app.rejectionOtherDetail
          ? ` (${app.rejectionOtherDetail})`
          : ""}
      </span>
      {app.status === "REJECTED" && app.rejectionDate && (
        <span className="block text-xs text-slate-500 dark:text-slate-400">
          Rejected on {app.rejectionDate.slice(8, 10)}/{app.rejectionDate.slice(5, 7)}/{app.rejectionDate.slice(0, 4)}
        </span>
      )}
      {app.status === "REJECTED" && app.adjustmentAvailable && (
        <span className="block text-xs font-medium text-amber-600 dark:text-amber-400">
          Fee credit available
        </span>
      )}
      {app.ackNumber && (
        <span className="block text-xs text-slate-500 dark:text-slate-400">
          Ack #{app.ackNumber}
        </span>
      )}

      {app.status !== "AGENT_DRAFT" && (
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={pendingStatus}
          onChange={(e) => setPendingStatus(e.target.value as FormStatus)}
          className="rounded border border-slate-300 px-1.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          {EDITABLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {pendingStatus === "REJECTED" && (
          <select
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value as RejectionReason)}
            className="rounded border border-slate-300 px-1.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            {(Object.keys(REJECTION_LABELS) as RejectionReason[]).map((r) => (
              <option key={r} value={r}>
                {REJECTION_LABELS[r]}
              </option>
            ))}
          </select>
        )}
        {pendingStatus === "REJECTED" && rejectionReason === "OTHER" && (
          <input
            value={rejectionOtherDetail}
            onChange={(e) => setRejectionOtherDetail(e.target.value)}
            placeholder="Please specify"
            className="rounded border border-slate-300 px-1.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        )}
        {pendingStatus === "REJECTED" && (
          <DateInput
            value={rejectionDate}
            onChange={setRejectionDate}
            className="w-24 rounded border border-slate-300 px-1.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        )}
        {dirty && (
          <button
            onClick={save}
            disabled={
              saving ||
              (pendingStatus === "REJECTED" && rejectionReason === "OTHER" && !rejectionOtherDetail) ||
              (pendingStatus === "REJECTED" && !rejectionDate)
            }
            className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {saving ? "…" : "Apply"}
          </button>
        )}
      </div>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export function TanListPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [searchParams] = useSearchParams();

  const [applications, setApplications] = useState<TanApplication[]>([]);
  const [statusFilter, setStatusFilter] = useState<FormStatus | "">((searchParams.get("status") as FormStatus) || "");

  useEffect(() => {
    const s = searchParams.get("status") as FormStatus | null;
    setStatusFilter(s ?? "");
  }, [searchParams]);
  const [categoryFilter, setCategoryFilter] = useState<ApplicantCategory | "">("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentFilter, setAgentFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showImportAckModal, setShowImportAckModal] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    api
      .get<Agent[]>("/agents", { params: { status: "ACTIVE" } })
      .then(({ data }) => setAgents(data))
      .catch(() => setAgents([]));
  }, []);

  const filterParams = {
    status: statusFilter || undefined,
    applicantCategory: categoryFilter || undefined,
    agentId: agentFilter || undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
    q: search || undefined,
  };

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<PaginatedResponse<TanApplication>>("/tan", {
        params: { ...filterParams, page, pageSize },
      });
      setApplications(data.items);
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
  }, [statusFilter, categoryFilter, agentFilter, fromDate, toDate, search]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, categoryFilter, agentFilter, fromDate, toDate, search, page, pageSize]);

  async function onDelete(id: number) {
    if (!window.confirm(`Delete TAN application #${id}? This cannot be undone.`)) return;
    try {
      await api.delete(`/tan/${id}`);
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
            TAN Applications
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {total} record{total === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Import Applications
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowImportAckModal(true)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Import Acknowledgements
          </button>
          <Link
            to="/tan/new"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            + New Application
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, mobile, agent, TAN…"
              className="w-56 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as FormStatus | "")}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">All</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as ApplicantCategory | "")}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">All</option>
              {(Object.keys(APPLICANT_CATEGORY_LABELS) as ApplicantCategory[]).map((c) => (
                <option key={c} value={c}>
                  {APPLICANT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
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
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Form Received From</label>
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
          {(categoryFilter || agentFilter || fromDate || toDate) && (
            <button
              type="button"
              onClick={() => {
                setCategoryFilter("");
                setAgentFilter("");
                setFromDate("");
                setToDate("");
              }}
              className="rounded-lg px-2 py-1.5 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Clear
            </button>
          )}
        </div>
        <ExportButtons exportPath="/tan/export" params={filterParams} />
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
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Form</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Fee</th>
              <th className="px-4 py-3">Entered By</th>
              <th className="px-4 py-3">Status</th>
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
            {!loading && applications.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-slate-500">
                  No applications found.
                </td>
              </tr>
            )}
            {applications.map((app) => (
              <tr key={app.id}>
                <td className="px-4 py-3 text-slate-500">#{app.id}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    {app.applicantName}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{app.mobile}</div>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {APPLICANT_CATEGORY_LABELS[app.applicantCategory]}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {getTanFormNumber(app.applicationType, app.applicantCategory)}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {app.sourceType === "AGENT" ? app.agent?.agentName ?? "Agent" : "Office"}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{app.paymentMode}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">₹{app.feeAmount}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{app.createdBy?.fullName ?? "—"}</td>
                <td className="px-4 py-3">
                  <StatusCell app={app} onUpdated={load} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Link
                      to={`/tan/${app.id}`}
                      title="View"
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      👁
                    </Link>
                    {isAdmin && (
                      <>
                        <Link
                          to={`/tan/${app.id}/edit`}
                          title="Edit"
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          ✏️
                        </Link>
                        <button
                          onClick={() => onDelete(app.id)}
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

      {showImportModal && (
        <BulkImportModal
          title="Import TAN Applications"
          description="Upload an .xlsx/.csv file to create many TAN applications at once. ADJUSTED payment mode isn't supported via import — use the entry form for those."
          importPath="/tan/import"
          templatePath="/tan/import-template"
          templateFilename="tan-import-template.xlsx"
          onClose={() => setShowImportModal(false)}
          onImported={load}
        />
      )}

      {showImportAckModal && (
        <ImportAckModal module="TAN" onClose={() => setShowImportAckModal(false)} onImported={load} />
      )}
    </div>
  );
}
