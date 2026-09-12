import { useEffect, useState } from "react";
import { api, extractErrorMessage } from "../../api/client";
import type { Agent, AgentLedger } from "../../types";

export function AgentLedgerModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [ledger, setLedger] = useState<AgentLedger | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AgentLedger>(`/agents/${agent.id}/ledger`)
      .then(({ data }) => setLedger(data))
      .catch((err) => setError(extractErrorMessage(err)));
  }, [agent.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {agent.agentName} — Ledger
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {agent.firmName ?? agent.mobile}
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {!ledger && !error && <p className="mt-4 text-sm text-slate-500">Loading…</p>}

        {ledger && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {ledger.forms.submitted}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Submitted</div>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-500/10">
                <div className="text-xl font-semibold text-emerald-700 dark:text-emerald-400">
                  {ledger.forms.accepted}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Accepted</div>
              </div>
              <div className="rounded-lg bg-red-50 p-3 dark:bg-red-500/10">
                <div className="text-xl font-semibold text-red-700 dark:text-red-400">
                  {ledger.forms.rejected}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Rejected</div>
              </div>
              <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-500/10">
                <div className="text-xl font-semibold text-amber-700 dark:text-amber-400">
                  {ledger.adjustmentBalance}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Fee Credits</div>
              </div>
            </div>

            <div
              className={`rounded-lg p-3 text-center ${
                ledger.feeDueFromAgent > 0
                  ? "bg-red-50 dark:bg-red-500/10"
                  : ledger.feeDueFromAgent < 0
                    ? "bg-blue-50 dark:bg-blue-500/10"
                    : "bg-slate-50 dark:bg-slate-800"
              }`}
            >
              <div
                className={`text-xl font-semibold ${
                  ledger.feeDueFromAgent > 0
                    ? "text-red-700 dark:text-red-400"
                    : ledger.feeDueFromAgent < 0
                      ? "text-blue-700 dark:text-blue-400"
                      : "text-slate-900 dark:text-slate-100"
                }`}
              >
                ₹{Math.abs(ledger.feeDueFromAgent).toFixed(2)}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {ledger.feeDueFromAgent > 0
                  ? "Agent owes the office (collected less than standard fee)"
                  : ledger.feeDueFromAgent < 0
                    ? "Office owes the agent (collected more than standard fee)"
                    : "Fully settled against the fee schedule"}
              </div>
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
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
