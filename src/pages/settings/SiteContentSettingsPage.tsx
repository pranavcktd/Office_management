import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, extractErrorMessage } from "../../api/client";

const textareaClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";
const labelClass = "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";

interface SiteContentConfig {
  headerNotice: string;
  footerNotice: string;
  loginNotice: string;
}

export function SiteContentSettingsPage() {
  const [form, setForm] = useState<SiteContentConfig>({ headerNotice: "", footerNotice: "", loginNotice: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<SiteContentConfig>("/settings/site-content")
      .then(({ data }) => setForm(data))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof SiteContentConfig>(key: K, value: SiteContentConfig[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const { data } = await api.put<SiteContentConfig>("/settings/site-content", form);
      setForm(data);
      setNotice("Saved.");
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

      <form onSubmit={onSave} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Site Notices</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Plain text shown to everyone — line breaks are preserved. Leave a field blank to hide
            it. Use these for things like an announcement, a data-migration note, or office hours.
          </p>
        </div>

        <div>
          <label className={labelClass}>Header Notice (shown at the top of every page, after sign-in)</label>
          <textarea
            className={textareaClass}
            rows={2}
            value={form.headerNotice}
            onChange={(e) => set("headerNotice", e.target.value)}
          />
        </div>

        <div>
          <label className={labelClass}>Footer Notice (shown above the contact line, every page)</label>
          <textarea
            className={textareaClass}
            rows={2}
            value={form.footerNotice}
            onChange={(e) => set("footerNotice", e.target.value)}
          />
        </div>

        <div>
          <label className={labelClass}>Login Page Notice (shown on the sign-in screen, before anyone logs in)</label>
          <textarea
            className={textareaClass}
            rows={3}
            value={form.loginNotice}
            onChange={(e) => set("loginNotice", e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
