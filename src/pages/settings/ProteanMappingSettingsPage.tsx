import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, extractErrorMessage } from "../../api/client";
import type { ProteanReportMapping } from "../../types";
import { formatDateTime } from "../../utils/date";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";
const labelClass = "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";

interface FormState {
  ackNumberHeader: string;
  applicantNameHeader: string;
  applicantLastNameHeader: string;
  firstNameHeader: string;
  middleNameHeader: string;
  fatherLastNameHeader: string;
  fatherFirstNameHeader: string;
  fatherMiddleNameHeader: string;
  dobHeader: string;
  emailHeader: string;
  mobileHeader: string;
  punchingDateHeader: string;
  applicationTypeHeader: string;
}

const EMPTY_FORM: FormState = {
  ackNumberHeader: "",
  applicantNameHeader: "",
  applicantLastNameHeader: "",
  firstNameHeader: "",
  middleNameHeader: "",
  fatherLastNameHeader: "",
  fatherFirstNameHeader: "",
  fatherMiddleNameHeader: "",
  dobHeader: "",
  emailHeader: "",
  mobileHeader: "",
  punchingDateHeader: "",
  applicationTypeHeader: "",
};

function toForm(data: ProteanReportMapping): FormState {
  return {
    ackNumberHeader: data.ackNumberHeader,
    applicantNameHeader: data.applicantNameHeader ?? "",
    applicantLastNameHeader: data.applicantLastNameHeader ?? "",
    firstNameHeader: data.firstNameHeader ?? "",
    middleNameHeader: data.middleNameHeader ?? "",
    fatherLastNameHeader: data.fatherLastNameHeader ?? "",
    fatherFirstNameHeader: data.fatherFirstNameHeader ?? "",
    fatherMiddleNameHeader: data.fatherMiddleNameHeader ?? "",
    dobHeader: data.dobHeader ?? "",
    emailHeader: data.emailHeader ?? "",
    mobileHeader: data.mobileHeader ?? "",
    punchingDateHeader: data.punchingDateHeader ?? "",
    applicationTypeHeader: data.applicationTypeHeader ?? "",
  };
}

/** Every value here is a lowercase, distinctive fragment of the real column header — not
 * necessarily the full text — matched as a substring against row 1 of the uploaded report
 * (case/quote/whitespace-insensitive). This is what lets the office fix a Protean wording change
 * themselves (e.g. "Acknowledgement" vs "Acknowledgment", or a header growing a "/ Surname"
 * suffix) without needing a code change — see runPanProteanPunchingImport /
 * runTanProteanPunchingImport in the backend. */
export function ProteanMappingSettingsPage() {
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
      .get<ProteanReportMapping>(`/settings/protean-mapping/${module}`)
      .then(({ data }) => {
        setForm(toForm(data));
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
      const { data } = await api.put<ProteanReportMapping>(`/settings/protean-mapping/${module}`, {
        ackNumberHeader: form.ackNumberHeader,
        applicantNameHeader: form.applicantNameHeader || null,
        applicantLastNameHeader: form.applicantLastNameHeader || null,
        firstNameHeader: form.firstNameHeader || null,
        middleNameHeader: form.middleNameHeader || null,
        fatherLastNameHeader: form.fatherLastNameHeader || null,
        fatherFirstNameHeader: form.fatherFirstNameHeader || null,
        fatherMiddleNameHeader: form.fatherMiddleNameHeader || null,
        dobHeader: form.dobHeader || null,
        emailHeader: form.emailHeader || null,
        mobileHeader: form.mobileHeader || null,
        punchingDateHeader: form.punchingDateHeader || null,
        applicationTypeHeader: form.applicationTypeHeader || null,
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
        Each field is a distinctive part of the real column header in your Protean punching report
        — not necessarily the full text, and not case-sensitive. If Protean changes a header's
        exact wording in a future report, update the matching field here rather than asking for a
        code change; the "Import Protean Punching Report" screen's Preview always shows exactly
        which columns it found before anything is saved. Leave a field blank to skip that column
        entirely (e.g. TAN has no Father's Name columns). Changes here take effect immediately.
      </p>

      {loading ? (
        <div className="mt-6 text-sm text-slate-500">Loading…</div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-5">
          <div>
            <label className={labelClass}>Acknowledgement Number column (required)</label>
            <input
              className={inputClass}
              value={form.ackNumberHeader}
              onChange={(e) => set("ackNumberHeader", e.target.value)}
              placeholder="e.g. acknowledg"
              required
            />
          </div>

          {module === "TAN" ? (
            <div>
              <label className={labelClass}>Applicant Name column (required)</label>
              <input
                className={inputClass}
                value={form.applicantNameHeader}
                onChange={(e) => set("applicantNameHeader", e.target.value)}
                placeholder="e.g. applicant name"
              />
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                Applicant name (split across three columns — required)
              </p>
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Last Name column</label>
                  <input
                    className={inputClass}
                    value={form.applicantLastNameHeader}
                    onChange={(e) => set("applicantLastNameHeader", e.target.value)}
                    placeholder="e.g. applicant last name"
                  />
                </div>
                <div>
                  <label className={labelClass}>First Name column</label>
                  <input
                    className={inputClass}
                    value={form.firstNameHeader}
                    onChange={(e) => set("firstNameHeader", e.target.value)}
                    placeholder="e.g. first name"
                  />
                </div>
                <div>
                  <label className={labelClass}>Middle Name column</label>
                  <input
                    className={inputClass}
                    value={form.middleNameHeader}
                    onChange={(e) => set("middleNameHeader", e.target.value)}
                    placeholder="e.g. middle name"
                  />
                </div>
              </div>
            </div>
          )}

          {module === "PAN" && (
            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                Father's name (split across three columns — optional)
              </p>
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Father's Last Name column</label>
                  <input
                    className={inputClass}
                    value={form.fatherLastNameHeader}
                    onChange={(e) => set("fatherLastNameHeader", e.target.value)}
                    placeholder="e.g. father's last name"
                  />
                </div>
                <div>
                  <label className={labelClass}>Father's First Name column</label>
                  <input
                    className={inputClass}
                    value={form.fatherFirstNameHeader}
                    onChange={(e) => set("fatherFirstNameHeader", e.target.value)}
                    placeholder="e.g. father's first name"
                  />
                </div>
                <div>
                  <label className={labelClass}>Father's Middle Name column</label>
                  <input
                    className={inputClass}
                    value={form.fatherMiddleNameHeader}
                    onChange={(e) => set("fatherMiddleNameHeader", e.target.value)}
                    placeholder="e.g. father's middle name"
                  />
                </div>
              </div>
            </div>
          )}

          {module === "PAN" && (
            <div>
              <label className={labelClass}>Date of Birth column</label>
              <input
                className={inputClass}
                value={form.dobHeader}
                onChange={(e) => set("dobHeader", e.target.value)}
                placeholder="e.g. date of birth"
              />
            </div>
          )}

          {module === "PAN" && (
            <div>
              <label className={labelClass}>Email column</label>
              <input
                className={inputClass}
                value={form.emailHeader}
                onChange={(e) => set("emailHeader", e.target.value)}
                placeholder="e.g. email"
              />
            </div>
          )}

          <div>
            <label className={labelClass}>{module === "PAN" ? "Telephone/Mobile column" : "Mobile column"}</label>
            <input
              className={inputClass}
              value={form.mobileHeader}
              onChange={(e) => set("mobileHeader", e.target.value)}
              placeholder={module === "PAN" ? "e.g. telephone no" : "leave blank — today's TAN report has none"}
            />
          </div>

          <div>
            <label className={labelClass}>{module === "PAN" ? "Punching Date column" : "Receipt Date column"}</label>
            <input
              className={inputClass}
              value={form.punchingDateHeader}
              onChange={(e) => set("punchingDateHeader", e.target.value)}
              placeholder={module === "PAN" ? "e.g. date" : "e.g. receipt date"}
            />
          </div>

          {module === "TAN" && (
            <div>
              <label className={labelClass}>Application Type column (New vs Correction, optional)</label>
              <input
                className={inputClass}
                value={form.applicationTypeHeader}
                onChange={(e) => set("applicationTypeHeader", e.target.value)}
                placeholder="e.g. application type"
              />
            </div>
          )}

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
