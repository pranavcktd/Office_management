import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, extractErrorMessage } from "../../api/client";
import type { Staff } from "../../types";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";
const labelClass = "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";

interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  dayEndReportTime: string;
  updatedAt?: string | null;
}

const PASS_MASK = "********";

export function EmailSettingsPage() {
  const [form, setForm] = useState<EmailConfig>({
    smtpHost: "",
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: "",
    smtpPass: "",
    smtpFrom: "",
    dayEndReportTime: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);

  const [staff, setStaff] = useState<Staff[]>([]);
  const [recipientIds, setRecipientIds] = useState<Set<number>>(new Set());
  const [savingRecipients, setSavingRecipients] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);

  async function loadConfig() {
    const { data } = await api.get<EmailConfig>("/settings/email");
    setForm(data);
  }

  async function loadRecipients() {
    const [staffRes, recipientsRes] = await Promise.all([
      api.get<Staff[]>("/staff"),
      api.get<{ id: number }[]>("/settings/day-end-recipients"),
    ]);
    setStaff(staffRes.data);
    setRecipientIds(new Set(recipientsRes.data.map((r) => r.id)));
  }

  useEffect(() => {
    Promise.all([loadConfig(), loadRecipients()])
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof EmailConfig>(key: K, value: EmailConfig[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSaveConfig(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const { data } = await api.put<EmailConfig>("/settings/email", {
        smtpHost: form.smtpHost,
        smtpPort: form.smtpPort,
        smtpSecure: form.smtpSecure,
        smtpUser: form.smtpUser,
        smtpPass: form.smtpPass,
        smtpFrom: form.smtpFrom,
        dayEndReportTime: form.dayEndReportTime,
      });
      setForm(data);
      setNotice("Saved.");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function onSendTest() {
    if (!testTo) return;
    setError(null);
    setNotice(null);
    setTesting(true);
    try {
      await api.post("/settings/email/test", { to: testTo });
      setNotice(`Test email sent to ${testTo}.`);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setTesting(false);
    }
  }

  function toggleRecipient(id: number) {
    setRecipientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSaveRecipients() {
    setError(null);
    setNotice(null);
    setSavingRecipients(true);
    try {
      await api.put("/settings/day-end-recipients", { staffIds: [...recipientIds] });
      setNotice("Recipients saved.");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingRecipients(false);
    }
  }

  async function onSendNow() {
    setError(null);
    setNotice(null);
    setSendingNow(true);
    try {
      await api.post("/day-end-report/send");
      setNotice("Day-end report sent to configured recipients.");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSendingNow(false);
    }
  }

  async function onPreview() {
    setError(null);
    try {
      const response = await api.get("/day-end-report/preview", { responseType: "blob" });
      const url = URL.createObjectURL(response.data as Blob);
      window.open(url, "_blank");
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  if (loading) {
    return <div className="text-sm text-slate-500">Loading…</div>;
  }

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

      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">SMTP Configuration</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Used for sign-in alerts and the day-end report. Falls back to the server's .env values
          if left blank.
        </p>

        <form onSubmit={onSaveConfig} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>SMTP Host</label>
              <input className={inputClass} value={form.smtpHost} onChange={(e) => set("smtpHost", e.target.value)} placeholder="smtp.gmail.com" />
            </div>
            <div>
              <label className={labelClass}>Port</label>
              <input
                type="number"
                className={inputClass}
                value={form.smtpPort}
                onChange={(e) => set("smtpPort", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>SMTP User</label>
              <input className={inputClass} value={form.smtpUser} onChange={(e) => set("smtpUser", e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>
                SMTP Password
                {form.smtpPass === PASS_MASK && (
                  <span className="ml-1 font-normal text-slate-400">(leave as-is to keep unchanged)</span>
                )}
              </label>
              <input
                type="password"
                className={inputClass}
                value={form.smtpPass}
                onChange={(e) => set("smtpPass", e.target.value)}
                onFocus={() => form.smtpPass === PASS_MASK && set("smtpPass", "")}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>From Address</label>
              <input className={inputClass} value={form.smtpFrom} onChange={(e) => set("smtpFrom", e.target.value)} placeholder="office@example.com" />
            </div>
            <div className="flex items-end pb-2.5">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.smtpSecure}
                  onChange={(e) => set("smtpSecure", e.target.checked)}
                />
                Use TLS/SSL (secure)
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save SMTP Settings"}
            </button>
          </div>
        </form>

        <div className="mt-5 flex items-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="flex-1">
            <label className={labelClass}>Send a test email to</label>
            <input
              type="email"
              className={inputClass}
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <button
            type="button"
            onClick={onSendTest}
            disabled={testing || !testTo}
            className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {testing ? "Sending…" : "Send Test"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Day-End Report</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Every day at this time, a PDF summarising the day's PAN, TAN, attendance, client query
          and dispatch activity is emailed to the selected staff. Leave the time blank to disable
          the automatic send — you can still trigger it manually below.
        </p>

        <form onSubmit={onSaveConfig} className="mt-4 flex items-end gap-3">
          <div>
            <label className={labelClass}>Send time (24h)</label>
            <input
              type="time"
              className={inputClass}
              value={form.dayEndReportTime}
              onChange={(e) => set("dayEndReportTime", e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Save Time
          </button>
        </form>

        <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
          <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            Recipients — which staff receive the report
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {staff.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={recipientIds.has(s.id)}
                  onChange={() => toggleRecipient(s.id)}
                />
                {s.fullName} {!s.email && <span className="text-xs text-slate-400">(no email on file)</span>}
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onSaveRecipients}
              disabled={savingRecipients}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {savingRecipients ? "Saving…" : "Save Recipients"}
            </button>
            <button
              type="button"
              onClick={onSendNow}
              disabled={sendingNow}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {sendingNow ? "Sending…" : "Send Report Now"}
            </button>
            <button
              type="button"
              onClick={onPreview}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Preview PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
