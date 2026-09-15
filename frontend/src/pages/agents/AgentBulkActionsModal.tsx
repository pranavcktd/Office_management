import { useState } from "react";
import type { FormEvent } from "react";
import { api, extractErrorMessage } from "../../api/client";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";
const labelClass = "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";

type Action = "email" | "notify" | "reset-password";

interface Props {
  action: Action;
  agentIds: number[];
  agentNames: string[];
  onClose: () => void;
  onDone: () => void;
}

const TITLES: Record<Action, string> = {
  email: "Send Email",
  notify: "Send Portal Notification",
  "reset-password": "Reset Passwords",
};

export function AgentBulkActionsModal({ action, agentIds, agentNames, onClose, onDone }: Props) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ done: string[]; skipped: string[] } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (action === "email") {
        const { data } = await api.post<{ sent: string[]; skipped: string[] }>("/agents/bulk/email", {
          agentIds,
          subject,
          message,
        });
        setResult({ done: data.sent, skipped: data.skipped });
      } else if (action === "notify") {
        const { data } = await api.post<{ notified: number }>("/agents/bulk/notify", { agentIds, message });
        setResult({ done: agentNames.slice(0, data.notified), skipped: [] });
      } else {
        const { data } = await api.post<{ reset: string[]; skipped: string[] }>("/agents/bulk/reset-password", {
          agentIds,
        });
        setResult({ done: data.reset, skipped: data.skipped });
      }
      onDone();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{TITLES[action]}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {agentIds.length} agent{agentIds.length === 1 ? "" : "s"} selected: {agentNames.join(", ")}
        </p>

        {!result ? (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            {action === "email" && (
              <div>
                <label className={labelClass}>Subject</label>
                <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} required />
              </div>
            )}
            {(action === "email" || action === "notify") && (
              <div>
                <label className={labelClass}>Message</label>
                <textarea
                  className={inputClass}
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                />
              </div>
            )}
            {action === "reset-password" && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                Each selected agent's password will be reset to the office default, and they'll be
                required to change it on next login. Agents with no email on file are skipped
                (they can't be told the new password).
              </p>
            )}

            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {submitting ? "Working…" : "Confirm"}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              {action === "email" ? "Sent" : action === "notify" ? "Notified" : "Reset"} for{" "}
              {result.done.length} agent{result.done.length === 1 ? "" : "s"}
              {result.done.length > 0 ? `: ${result.done.join(", ")}` : ""}.
            </p>
            {result.skipped.length > 0 && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                Skipped: {result.skipped.join(", ")}
              </p>
            )}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
