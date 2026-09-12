import { useEffect, useState } from "react";
import { api, extractErrorMessage } from "../api/client";
import { REJECTION_LABELS } from "../types";
import type { AdjustmentCandidate, Agent, SourceType } from "../types";

interface Props {
  apiPath: "/pan/adjustment-candidates" | "/tan/adjustment-candidates";
  /** Initial guess only — the modal has its own Source selector since the OLD rejected
   * form's source (where the fee credit came from) may differ from the new form's source. */
  initialSourceType: SourceType;
  initialAgentId?: number | null;
  initialKeyword?: string;
  onSelect: (candidate: AdjustmentCandidate) => void;
  onClose: () => void;
}

const selectClass =
  "rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white";

export function AdjustmentLookupModal({
  apiPath,
  initialSourceType,
  initialAgentId,
  initialKeyword,
  onSelect,
  onClose,
}: Props) {
  const [sourceType, setSourceType] = useState<SourceType>(initialSourceType);
  const [agentId, setAgentId] = useState<string>(initialAgentId ? String(initialAgentId) : "");
  const [keyword, setKeyword] = useState(initialKeyword ?? "");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [candidates, setCandidates] = useState<AdjustmentCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Agent[]>("/agents", { params: { status: "ACTIVE" } })
      .then(({ data }) => setAgents(data))
      .catch(() => setAgents([]));
  }, []);

  useEffect(() => {
    if (sourceType === "AGENT" && !agentId) {
      setCandidates([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, string> =
          sourceType === "AGENT" ? { sourceType, agentId } : { sourceType, q: keyword };
        const { data } = await api.get<AdjustmentCandidate[]>(apiPath, { params });
        if (!cancelled) setCandidates(data);
      } catch (err) {
        if (!cancelled) setError(extractErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250); // debounce keyword typing

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [apiPath, sourceType, agentId, keyword]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Select a rejected form to adjust
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Choose where the original rejected form came from — it may differ from this new
          form's source.
        </p>

        <div className="mt-4 flex gap-2">
          <select
            value={sourceType}
            onChange={(e) => {
              setSourceType(e.target.value as SourceType);
              setAgentId("");
              setKeyword("");
            }}
            className={selectClass}
          >
            <option value="OFFICE">Office Walk-in</option>
            <option value="AGENT">Agent</option>
          </select>

          {sourceType === "AGENT" ? (
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={`flex-1 ${selectClass}`}>
              <option value="">Select an agent…</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.agentName} {a.firmName ? `(${a.firmName})` : ""}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search by name or mobile…"
              className={`flex-1 ${selectClass}`}
            />
          )}
        </div>

        <div className="mt-4 max-h-80 overflow-y-auto">
          {loading && <p className="py-6 text-center text-sm text-slate-500">Loading…</p>}
          {error && <p className="py-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          {!loading && !error && sourceType === "AGENT" && !agentId && (
            <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Select an agent to see their eligible rejected forms.
            </p>
          )}
          {!loading && !error && candidates.length === 0 && (sourceType === "OFFICE" || agentId) && (
            <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No eligible rejected forms found.
            </p>
          )}
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {candidates.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      #{c.id} — {c.applicantName}
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {c.mobile} · ₹{c.feeAmount} · {REJECTION_LABELS[c.rejectionReason]}
                    </span>
                  </span>
                  <span className="text-indigo-600 dark:text-indigo-400">Select</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
