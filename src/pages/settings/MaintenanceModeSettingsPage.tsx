import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, extractErrorMessage } from "../../api/client";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";
const labelClass = "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";

interface MaintenanceConfig {
  enabled: boolean;
  message: string;
  until: string | null;
}

const DEFAULT_MESSAGE = "We're working on updates to the app — it'll be back and available shortly.";

/** ISO datetime <-> the value a <input type="datetime-local"> wants (no timezone suffix). */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MaintenanceModeSettingsPage() {
  const [config, setConfig] = useState<MaintenanceConfig>({ enabled: false, message: "", until: null });
  const [untilLocal, setUntilLocal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<MaintenanceConfig>("/settings/maintenance-mode");
      setConfig(data);
      setUntilLocal(isoToLocalInput(data.until));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onSave(e: FormEvent, enabled: boolean) {
    e.preventDefault();
    if (enabled && !config.enabled) {
      if (
        !window.confirm(
          "This immediately signs out every staff member, auditor, and agent currently logged in — only admin logins will keep working until you turn this off. Continue?"
        )
      ) {
        return;
      }
    }
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const { data } = await api.put<MaintenanceConfig & { revokedSessions: number }>("/settings/maintenance-mode", {
        enabled,
        message: config.message,
        until: untilLocal ? new Date(untilLocal).toISOString() : null,
      });
      setConfig(data);
      setNotice(
        enabled
          ? `Maintenance mode is ON. ${data.revokedSessions} active session${data.revokedSessions === 1 ? "" : "s"} signed out.`
          : "Maintenance mode is OFF — everyone can sign in again."
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm text-slate-500">Loading…</div>;

  return (
    <div className="max-w-2xl space-y-6">
      {(error || notice) && (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            error
              ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          }`}
        >
          {error ?? notice}
        </p>
      )}

      <div
        className={`rounded-xl border p-5 ${
          config.enabled
            ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
            : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        }`}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Maintenance Mode</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              config.enabled
                ? "bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
            }`}
          >
            {config.enabled ? "ON — logins blocked" : "OFF — app is live"}
          </span>
        </div>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          While on: every staff, auditor, and agent session is immediately signed out and new
          logins are blocked with the message below. Admin sign-in always keeps working, so you
          can get back in to turn it off. Use this to guarantee nobody's actively using the app
          while you change code or the database schema.
        </p>

        <form className="space-y-4">
          <div>
            <label className={labelClass}>Message shown to whoever is blocked</label>
            <textarea
              className={inputClass}
              rows={3}
              value={config.message}
              placeholder={DEFAULT_MESSAGE}
              onChange={(e) => setConfig((prev) => ({ ...prev, message: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelClass}>Expected back (optional — shown to whoever is blocked, nothing re-enables automatically)</label>
            <input
              type="datetime-local"
              className={inputClass}
              value={untilLocal}
              onChange={(e) => setUntilLocal(e.target.value)}
            />
          </div>

          <div className="flex gap-2 pt-1">
            {!config.enabled ? (
              <button
                type="button"
                disabled={saving}
                onClick={(e) => onSave(e, true)}
                className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-60"
              >
                {saving ? "Enabling…" : "Enable Maintenance Mode"}
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={(e) => onSave(e, false)}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {saving ? "Disabling…" : "Disable Maintenance Mode"}
              </button>
            )}
            {config.enabled && (
              <button
                type="button"
                disabled={saving}
                onClick={(e) => onSave(e, true)}
                className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Update Message
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
