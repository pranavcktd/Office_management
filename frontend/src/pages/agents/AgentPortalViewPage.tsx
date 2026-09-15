import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { Pagination } from "../../components/Pagination";
import {
  CREDIT_STATUS_LABELS,
  REJECTION_LABELS,
  STATUS_LABELS,
} from "../../types";
import type {
  AgentPortalApplication,
  AgentPortalSummary,
  CreditStatus,
  FormStatus,
  PaginatedResponse,
} from "../../types";
import { formatDate } from "../../utils/date";

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

function Stat({ label, value, accent, active, onClick }: { label: string; value: number; accent?: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg p-3 text-center transition ${
        active ? "bg-indigo-100 dark:bg-indigo-500/20" : "bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700"
      }`}
    >
      <div className={`text-2xl font-semibold ${accent ?? "text-slate-900 dark:text-slate-100"}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </button>
  );
}

/** Admin's read-only "view as agent" — reuses the same admin-only backend endpoints
 * (GET /agents/:agentId/portal/...) as the agent's own portal, but scoped by :agentId instead of
 * the caller's session, and with no write actions (no new-draft buttons, no edit links) since
 * this is for support/review only. Application rows link to the real admin PAN/TAN detail pages
 * (where admin already has full view+edit rights) rather than a separate read-only clone. */
export function AgentPortalViewPage() {
  const { agentId } = useParams();
  const [summary, setSummary] = useState<AgentPortalSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [apps, setApps] = useState<AgentPortalApplication[]>([]);
  const [moduleFilter, setModuleFilter] = useState<"" | "PAN" | "TAN">("");
  const [statusFilter, setStatusFilter] = useState<FormStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    api
      .get<AgentPortalSummary>(`/agents/${agentId}/portal/summary`)
      .then(({ data }) => setSummary(data))
      .catch((err) => setSummaryError(extractErrorMessage(err)));
  }, [agentId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<PaginatedResponse<AgentPortalApplication>>(`/agents/${agentId}/portal/applications`, {
        params: { module: moduleFilter || undefined, status: statusFilter || undefined, page, pageSize },
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
  }, [moduleFilter, statusFilter]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleFilter, statusFilter, page, pageSize]);

  if (summaryError) {
    return (
      <div className="px-6 py-8">
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{summaryError}</p>
      </div>
    );
  }
  if (!summary) return <div className="px-6 py-8 text-sm text-slate-500">Loading…</div>;

  const { agent, ledger, openQueries } = summary;

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{agent.agentName} — Portal (View Only)</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {agent.firmName ? `${agent.firmName} · ` : ""}
            {agent.mobile}
          </p>
        </div>
        <Link
          to="/agents"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Back to Agents
        </Link>
      </div>

      <p className="mb-4 rounded-md bg-indigo-50 px-3 py-2 text-sm text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
        You're viewing this exactly as the agent would see their own dashboard — read-only. Click any application to open it in the regular PAN/TAN admin view, where you can edit it if needed.
      </p>

      <div className="grid gap-4 sm:grid-cols-5">
        <Stat
          label="Forms Submitted"
          value={ledger.forms.submitted}
          active={statusFilter === ""}
          onClick={() => setStatusFilter("")}
        />
        <Stat
          label="Under Entry"
          value={ledger.forms.underEntry ?? 0}
          accent="text-slate-700 dark:text-slate-300"
          active={statusFilter === "UNDER_ENTRY"}
          onClick={() => setStatusFilter("UNDER_ENTRY")}
        />
        <Stat
          label="Accepted"
          value={ledger.forms.accepted}
          accent="text-emerald-700 dark:text-emerald-400"
          active={statusFilter === "ACK_GENERATED"}
          onClick={() => setStatusFilter("ACK_GENERATED")}
        />
        <Stat
          label="Rejected"
          value={ledger.forms.rejected}
          accent="text-red-700 dark:text-red-400"
          active={statusFilter === "REJECTED"}
          onClick={() => setStatusFilter("REJECTED")}
        />
        <Stat label="Fee Credit Balance" value={ledger.adjustmentBalance} accent="text-amber-700 dark:text-amber-400" />
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Fee Settlement</h2>
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            className={`text-2xl font-semibold ${
              ledger.feeDueFromAgent > 0
                ? "text-red-700 dark:text-red-400"
                : ledger.feeDueFromAgent < 0
                  ? "text-blue-700 dark:text-blue-400"
                  : "text-emerald-700 dark:text-emerald-400"
            }`}
          >
            ₹{Math.abs(ledger.feeDueFromAgent).toFixed(2)}
          </span>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {ledger.feeDueFromAgent > 0
              ? "the agent owes the office (collected less than the standard fee)"
              : ledger.feeDueFromAgent < 0
                ? "the office owes the agent (collected more than the standard fee)"
                : "fully settled against the fee schedule"}
          </span>
        </div>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {openQueries === 0
            ? "No open queries from this agent."
            : `${openQueries} open quer${openQueries === 1 ? "y" : "ies"} from this agent awaiting a response.`}
        </p>
      </div>

      <div className="mt-6 mb-4 flex flex-wrap items-end gap-3">
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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">Loading…</td>
              </tr>
            )}
            {!loading && apps.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">No applications found.</td>
              </tr>
            )}
            {apps.map((a) => (
              <tr key={`${a.module}-${a.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">
                  <Link to={`/${a.module.toLowerCase()}/${a.id}`} className="text-indigo-600 hover:underline dark:text-indigo-400">
                    {a.module} #{a.id}
                  </Link>
                </td>
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
