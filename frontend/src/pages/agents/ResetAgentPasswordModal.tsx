import { useState } from "react";
import { api, extractErrorMessage } from "../../api/client";
import type { Agent } from "../../types";

export function ResetAgentPasswordModal({ agent, onClose, onDone }: { agent: Agent; onClose: () => void; onDone: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetTo, setResetTo] = useState<string | null>(null);

  async function onConfirm() {
    setError(null);
    setSaving(true);
    try {
      const { data } = await api.post<{ ok: boolean; defaultPassword: string }>(`/agents/${agent.id}/reset-password`);
      setResetTo(data.defaultPassword);
      onDone();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Reset Password — {agent.agentName}
        </h2>

        {resetTo ? (
          <>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Agent-portal password reset to <span className="font-mono font-semibold">{resetTo}</span>. Share
              it with {agent.agentName} — they'll be required to set a new password the moment they sign in.
            </p>
            <div className="mt-4 flex justify-end">
              <button
                onClick={onClose}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              This sets the agent-portal login password back to the office default (and enables portal access
              if it wasn't already). {agent.agentName} will be required to choose a new password the next time
              they sign in.
            </p>

            {error && (
              <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {error}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {saving ? "Resetting…" : "Reset to Default Password"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
