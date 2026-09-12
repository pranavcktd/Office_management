import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, extractErrorMessage } from "../../api/client";
import type { AckImportMapping } from "../../types";
import { formatDateTime } from "../../utils/date";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";
const labelClass = "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";

interface FormState {
  ackNumberHeader: string;
  matchAadhaarHeader: string;
  matchNameHeader: string;
  matchMobileHeader: string;
  matchDobHeader: string;
}

const EMPTY_FORM: FormState = {
  ackNumberHeader: "",
  matchAadhaarHeader: "",
  matchNameHeader: "",
  matchMobileHeader: "",
  matchDobHeader: "",
};

export function AckMappingSettingsPage() {
  const [module, setModule] = useState<"PAN" | "TAN">("PAN");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .get<AckImportMapping>(`/settings/ack-mapping/${module}`)
      .then(({ data }) => {
        setForm({
          ackNumberHeader: data.ackNumberHeader,
          matchAadhaarHeader: data.matchAadhaarHeader ?? "",
          matchNameHeader: data.matchNameHeader ?? "",
          matchMobileHeader: data.matchMobileHeader ?? "",
          matchDobHeader: data.matchDobHeader ?? "",
        });
        setSavedAt(data.updatedAt ?? null);
      })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [module]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { data } = await api.put<AckImportMapping>(`/settings/ack-mapping/${module}`, {
        ackNumberHeader: form.ackNumberHeader,
        matchAadhaarHeader: module === "PAN" ? form.matchAadhaarHeader || null : null,
        matchNameHeader: form.matchNameHeader || null,
        matchMobileHeader: form.matchMobileHeader || null,
        matchDobHeader: form.matchDobHeader || null,
      });
      setSavedAt(data.updatedAt ?? null);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-5 flex rounded-lg bg-slate-100 p-1 text-sm dark:bg-slate-800">
        <button
          type="button"
          onClick={() => setModule("PAN")}
          className={`flex-1 rounded-md py-1.5 font-medium transition ${
            module === "PAN"
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          PAN
        </button>
        <button
          type="button"
          onClick={() => setModule("TAN")}
          className={`flex-1 rounded-md py-1.5 font-medium transition ${
            module === "TAN"
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          TAN
        </button>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Tell the system exactly which column headers your TIN-FC/Protean acknowledgement Excel
        report uses, so imports match reliably regardless of the file's exact format. Turn on
        more than one match column (e.g. {module === "PAN" ? "Aadhaar + Name" : "Name + Mobile"})
        when one applicant may have multiple applications on file, to avoid an ambiguous match.
      </p>

      {loading ? (
        <div className="mt-6 text-sm text-slate-500">Loading…</div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-5">
          <div>
            <label className={labelClass}>Acknowledgement Number column header (required)</label>
            <input
              className={inputClass}
              value={form.ackNumberHeader}
              onChange={(e) => set("ackNumberHeader", e.target.value)}
              placeholder="e.g. Acknowledgement Number"
              required
            />
          </div>

          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">
              Match columns — turn on at least one
            </p>
            <div className="space-y-3">
              {module === "PAN" && (
                <div>
                  <label className={labelClass}>Aadhaar Number column header</label>
                  <input
                    className={inputClass}
                    value={form.matchAadhaarHeader}
                    onChange={(e) => set("matchAadhaarHeader", e.target.value)}
                    placeholder="e.g. Aadhaar Number (leave blank to not match by Aadhaar)"
                  />
                </div>
              )}
              <div>
                <label className={labelClass}>Applicant Name column header</label>
                <input
                  className={inputClass}
                  value={form.matchNameHeader}
                  onChange={(e) => set("matchNameHeader", e.target.value)}
                  placeholder="e.g. Applicant Name"
                />
              </div>
              <div>
                <label className={labelClass}>Mobile column header</label>
                <input
                  className={inputClass}
                  value={form.matchMobileHeader}
                  onChange={(e) => set("matchMobileHeader", e.target.value)}
                  placeholder="e.g. Mobile Number"
                />
              </div>
              <div>
                <label className={labelClass}>{module === "PAN" ? "Date of Birth" : "Date of Incorporation/Birth"} column header</label>
                <input
                  className={inputClass}
                  value={form.matchDobHeader}
                  onChange={(e) => set("matchDobHeader", e.target.value)}
                  placeholder="e.g. DOB"
                />
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Settings"}
            </button>
            {savedAt && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Last saved {formatDateTime(savedAt)}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
