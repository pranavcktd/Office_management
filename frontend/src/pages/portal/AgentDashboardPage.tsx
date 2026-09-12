import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import type { AgentPortalSummary } from "../../types";

function Stat({ label, value, accent, to }: { label: string; value: number; accent?: string; to?: string }) {
  const content = (
    <>
      <div className={`text-2xl font-semibold ${accent ?? "text-slate-900 dark:text-slate-100"}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </>
  );
  const className = "block rounded-lg bg-slate-50 p-4 text-center transition hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700";
  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function AgentDashboardPage() {
  const [data, setData] = useState<AgentPortalSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AgentPortalSummary>("/agent-portal/summary")
      .then(({ data }) => setData(data))
      .catch((err) => setError(extractErrorMessage(err)));
  }, []);

  if (error) {
    return (
      <div className="px-6 py-8">
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>
      </div>
    );
  }
  if (!data) return <div className="px-6 py-8 text-sm text-slate-500">Loading…</div>;

  const { agent, ledger, openQueries } = data;

  return (
    <div className="px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Welcome, {agent.agentName}
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {agent.firmName ? `${agent.firmName} · ` : ""}
        {agent.mobile}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-5">
        <Stat label="Forms Submitted" value={ledger.forms.submitted} to="/portal/applications" />
        <Stat
          label="Under Entry"
          value={ledger.forms.underEntry ?? 0}
          accent="text-slate-700 dark:text-slate-300"
          to="/portal/applications?status=UNDER_ENTRY"
        />
        <Stat
          label="Accepted"
          value={ledger.forms.accepted}
          accent="text-emerald-700 dark:text-emerald-400"
          to="/portal/applications?status=ACK_GENERATED"
        />
        <Stat
          label="Rejected"
          value={ledger.forms.rejected}
          accent="text-red-700 dark:text-red-400"
          to="/portal/applications?status=REJECTED"
        />
        <Stat
          label="Fee Credit Balance"
          value={ledger.adjustmentBalance}
          accent="text-amber-700 dark:text-amber-400"
          to="/portal/applications?status=REJECTED"
        />
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Fee Settlement</h2>
        <div className="flex items-baseline gap-2">
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
              ? "you owe the office (collected less than the standard fee)"
              : ledger.feeDueFromAgent < 0
                ? "the office owes you (collected more than the standard fee)"
                : "fully settled against the fee schedule"}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">By Module</h2>
            <Link to="/portal/applications" className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              View all →
            </Link>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-1">Module</th>
                <th className="py-1 text-right">Submitted</th>
                <th className="py-1 text-right">Accepted</th>
                <th className="py-1 text-right">Rejected</th>
                <th className="py-1 text-right">Credits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              <tr>
                <td className="py-1.5 font-medium">PAN</td>
                <td className="py-1.5 text-right">{ledger.breakdown.pan.submitted}</td>
                <td className="py-1.5 text-right">{ledger.breakdown.pan.accepted}</td>
                <td className="py-1.5 text-right">{ledger.breakdown.pan.rejected}</td>
                <td className="py-1.5 text-right">{ledger.breakdown.pan.adjustmentAvailable}</td>
              </tr>
              <tr>
                <td className="py-1.5 font-medium">TAN</td>
                <td className="py-1.5 text-right">{ledger.breakdown.tan.submitted}</td>
                <td className="py-1.5 text-right">{ledger.breakdown.tan.accepted}</td>
                <td className="py-1.5 text-right">{ledger.breakdown.tan.rejected}</td>
                <td className="py-1.5 text-right">{ledger.breakdown.tan.adjustmentAvailable}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">My Queries</h2>
            <Link to="/portal/queries" className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              View / raise →
            </Link>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {openQueries === 0
              ? "You have no open queries."
              : `You have ${openQueries} open quer${openQueries === 1 ? "y" : "ies"} awaiting a response.`}
          </p>
        </div>
      </div>
    </div>
  );
}
