import { useEffect, useState } from "react";
import { api, extractErrorMessage } from "../../api/client";
import type { AgentFeeMatrixRow, FeeApplicationType, FeeSignedStatus } from "../../types";
import { todayYyyyMmDd } from "../../utils/date";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

interface FeeCategory {
  applicationType: FeeApplicationType;
  signedStatus: FeeSignedStatus;
  label: string;
  amount: number | null;
}

function keyFor(c: { applicationType: string; signedStatus: string }) {
  return `${c.applicationType}:${c.signedStatus}`;
}

function ModuleFeeSchedule({ module, title, effectiveFrom }: { module: "PAN" | "TAN"; title: string; effectiveFrom: string }) {
  const [categories, setCategories] = useState<FeeCategory[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ categories: FeeCategory[] }>(`/settings/fee-schedule/${module}`);
      setCategories(data.categories);
      setAmounts(Object.fromEntries(data.categories.map((c) => [keyFor(c), c.amount === null ? "" : String(c.amount)])));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module]);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const rates = categories
        .map((c) => ({ applicationType: c.applicationType, signedStatus: c.signedStatus, amount: amounts[keyFor(c)] }))
        .filter((r) => r.amount !== "")
        .map((r) => ({ applicationType: r.applicationType, signedStatus: r.signedStatus, amount: Number(r.amount) }));
      await api.put(`/settings/fee-schedule/${module}`, { rates, effectiveFrom });
      await load();
      setSaved(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      {loading ? (
        <p className="mt-3 text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {categories.map((c) => (
              <div key={keyFor(c)}>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{c.label}</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={inputClass}
                  value={amounts[keyFor(c)] ?? ""}
                  onChange={(e) => {
                    setAmounts((prev) => ({ ...prev, [keyFor(c)]: e.target.value }));
                    setSaved(false);
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={onSave}
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {saved && <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved.</span>}
          </div>
        </>
      )}
    </div>
  );
}

const AGENT_FEE_COLUMNS: Array<{ applicationType: FeeApplicationType; signedStatus: FeeSignedStatus; label: string }> = [
  { applicationType: "NEW", signedStatus: "SIGNATURE", label: "PAN New — Sig" },
  { applicationType: "NEW", signedStatus: "THUMB", label: "PAN New — Thumb" },
  { applicationType: "CORRECTION", signedStatus: "SIGNATURE", label: "PAN Corr. — Sig" },
  { applicationType: "CORRECTION", signedStatus: "THUMB", label: "PAN Corr. — Thumb" },
];
const AGENT_TAN_COLUMNS: Array<{ applicationType: FeeApplicationType; signedStatus: FeeSignedStatus; label: string }> = [
  { applicationType: "NEW", signedStatus: "", label: "TAN New" },
  { applicationType: "CORRECTION", signedStatus: "", label: "TAN Corr." },
];

function settlementLabel(amount: number) {
  if (amount > 0) return { text: `₹${amount.toFixed(2)} due from agent`, cls: "text-red-700 dark:text-red-400" };
  if (amount < 0) return { text: `₹${Math.abs(amount).toFixed(2)} owed to agent`, cls: "text-blue-700 dark:text-blue-400" };
  return { text: "Settled", cls: "text-slate-500 dark:text-slate-400" };
}

function BulkFeeRatesPanel({ onApplied, effectiveFrom }: { onApplied: () => void; effectiveFrom: string }) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const allColumns = [...AGENT_FEE_COLUMNS, ...AGENT_TAN_COLUMNS];

  async function apply() {
    if (!window.confirm("Apply this fee structure to every active agent? Any agent-specific rates already set will be overwritten.")) {
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const feeRates = allColumns.map((c) => ({
        module: c.signedStatus === "" ? "TAN" : "PAN",
        applicationType: c.applicationType,
        signedStatus: c.signedStatus,
        amount: amounts[keyFor(c)] ? Number(amounts[keyFor(c)]) : null,
      }));
      await api.put("/agents/fee-rates/bulk", { feeRates, effectiveFrom });
      setApplied(true);
      onApplied();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-indigo-300 bg-indigo-50/40 p-5 dark:border-indigo-800 dark:bg-indigo-500/5">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Bulk-set rates for all agents</h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Most agents share the same fee structure — set it once here and apply it to every active agent, then
        fine-tune individual agents below if any of them differ.
      </p>
      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {allColumns.map((c) => (
          <div key={keyFor(c)}>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{c.label}</label>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="Default"
              className={inputClass}
              value={amounts[keyFor(c)] ?? ""}
              onChange={(e) => {
                setAmounts((prev) => ({ ...prev, [keyFor(c)]: e.target.value }));
                setApplied(false);
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={apply}
          disabled={applying}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {applying ? "Applying…" : "Apply to All Agents"}
        </button>
        {applied && <span className="text-xs text-emerald-600 dark:text-emerald-400">Applied to all active agents.</span>}
      </div>
    </div>
  );
}

function AgentFeeMatrixTable({ reloadKey, effectiveFrom }: { reloadKey: number; effectiveFrom: string }) {
  const [rows, setRows] = useState<AgentFeeMatrixRow[]>([]);
  const [edits, setEdits] = useState<Record<number, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [recomputingId, setRecomputingId] = useState<number | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recomputeMessage, setRecomputeMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<AgentFeeMatrixRow[]>("/agents/fee-matrix");
      setRows(data);
      setEdits(
        Object.fromEntries(
          data.map((agent) => [
            agent.id,
            Object.fromEntries(agent.feeRates.map((r) => [keyFor(r), r.amount === null ? "" : String(r.amount)])),
          ])
        )
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  function setCell(agentId: number, key: string, value: string) {
    setEdits((prev) => ({ ...prev, [agentId]: { ...prev[agentId], [key]: value } }));
  }

  async function saveAgent(agentId: number) {
    setSavingId(agentId);
    setError(null);
    try {
      const rowEdits = edits[agentId] ?? {};
      const feeRates = [...AGENT_FEE_COLUMNS, ...AGENT_TAN_COLUMNS].map((c) => ({
        module: c.signedStatus === "" ? "TAN" : "PAN",
        applicationType: c.applicationType,
        signedStatus: c.signedStatus,
        amount: rowEdits[keyFor(c)] ? Number(rowEdits[keyFor(c)]) : null,
      }));
      await api.put(`/agents/${agentId}/fee-rates`, { feeRates, effectiveFrom });
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingId(null);
    }
  }

  async function recompute(agentId: number | "all") {
    setRecomputingId(agentId);
    setRecomputeMessage(null);
    setError(null);
    try {
      const body = agentId === "all" ? {} : { agentIds: [agentId] };
      const { data } = await api.post<{ agentsProcessed: number; formsUpdated: number }>(
        "/agents/fee-rates/recompute",
        body
      );
      setRecomputeMessage(`Rechecked ${data.agentsProcessed} agent(s), corrected ${data.formsUpdated} form(s).`);
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setRecomputingId(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No active agents yet — add one under Agents.</p>;
  }

  const allColumns = [...AGENT_FEE_COLUMNS, ...AGENT_TAN_COLUMNS];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50/60 px-4 py-3 dark:border-amber-800 dark:bg-amber-500/5">
        <p className="text-xs text-slate-600 dark:text-slate-300">
          Standard fee shown in Settlement is a snapshot taken when each form was saved — it doesn't
          update automatically when a rate above changes. Run this after correcting rates to refresh
          existing forms' settlement figures (each form keeps the rate in effect on its own date).
        </p>
        <button
          onClick={() => recompute("all")}
          disabled={recomputingId !== null}
          className="shrink-0 rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-60 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-slate-800"
        >
          {recomputingId === "all" ? "Recomputing…" : "Recompute Standard Fee — All Agents"}
        </button>
      </div>
      {recomputeMessage && (
        <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          {recomputeMessage}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {error && (
          <p className="m-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Agent</th>
              {allColumns.map((c) => (
                <th key={keyFor(c)} className="px-3 py-3">{c.label}</th>
              ))}
              <th className="px-4 py-3">Settlement</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((agent) => {
              const settlement = settlementLabel(agent.feeDueFromAgent);
              return (
                <tr key={agent.id}>
                  <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">
                    {agent.agentName}
                    {agent.firmName && <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">{agent.firmName}</span>}
                  </td>
                  {allColumns.map((c) => (
                    <td key={keyFor(c)} className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Default"
                        className="w-24 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        value={edits[agent.id]?.[keyFor(c)] ?? ""}
                        onChange={(e) => setCell(agent.id, keyFor(c), e.target.value)}
                      />
                    </td>
                  ))}
                  <td className={`whitespace-nowrap px-4 py-2 text-xs font-medium ${settlement.cls}`}>{settlement.text}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => saveAgent(agent.id)}
                        disabled={savingId === agent.id}
                        className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
                      >
                        {savingId === agent.id ? "…" : "Save"}
                      </button>
                      <button
                        onClick={() => recompute(agent.id)}
                        disabled={recomputingId !== null}
                        title="Recompute this agent's standard fee on existing forms"
                        className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        {recomputingId === agent.id ? "…" : "Recompute"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FeeMatrixPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [effectiveFrom, setEffectiveFrom] = useState(todayYyyyMmDd());

  return (
    <div className="px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Fee Matrix</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Set the office's fixed walk-in fees, and override rates per agent. A form's "standard
          fee" is looked up from the agent's own rate first, falling back to the office default
          — leave an agent cell blank to use the default. The Settlement column shows each
          agent's current fee position based on forms already recorded.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-800 dark:bg-indigo-500/5">
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
          Effective From (applies to every rate you save below)
        </label>
        <input
          type="date"
          value={effectiveFrom}
          max={todayYyyyMmDd()}
          onChange={(e) => setEffectiveFrom(e.target.value)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Leave as today for a normal rate change — it only affects forms from today onward, and
          past forms keep the rate that applied to them. Pick an earlier date (e.g. your system's
          start date) when correcting historical rates, so old forms are covered too — then run
          "Recompute Standard Fee" below to refresh their settlement figures.
        </p>
      </div>

      <div className="space-y-6">
        <ModuleFeeSchedule module="PAN" title="Office Walk-in Rates — PAN" effectiveFrom={effectiveFrom} />
        <ModuleFeeSchedule module="TAN" title="Office Walk-in Rates — TAN" effectiveFrom={effectiveFrom} />

        <BulkFeeRatesPanel onApplied={() => setReloadKey((k) => k + 1)} effectiveFrom={effectiveFrom} />

        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Agent-wise Rates</h2>
          <AgentFeeMatrixTable reloadKey={reloadKey} effectiveFrom={effectiveFrom} />
        </div>
      </div>
    </div>
  );
}
