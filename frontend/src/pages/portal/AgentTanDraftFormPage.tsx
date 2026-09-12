import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { DateInput } from "../../components/DateInput";
import { APPLICANT_CATEGORY_LABELS } from "../../types";
import type { ApplicantCategory } from "../../types";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";
const labelClass = "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";

interface FormState {
  tanApplicationType: "NEW" | "CORRECTION";
  existingTan: string;
  applicantCategory: ApplicantCategory;
  otherCategoryDetail: string;
  applicantName: string;
  dob: string;
  mobile: string;
  notes: string;
}

const initialState: FormState = {
  tanApplicationType: "NEW",
  existingTan: "",
  applicantCategory: "INDIVIDUAL",
  otherCategoryDetail: "",
  applicantName: "",
  dob: "",
  mobile: "",
  notes: "",
};

export function AgentTanDraftFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormState>(initialState);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/agent-portal/applications/TAN/${id}`)
      .then(({ data }) => {
        setForm({
          tanApplicationType: data.applicationType ?? "NEW",
          existingTan: data.existingTan ?? "",
          applicantCategory: data.applicantCategory ?? "INDIVIDUAL",
          otherCategoryDetail: data.otherCategoryDetail ?? "",
          applicantName: data.applicantName ?? "",
          dob: data.dob ? data.dob.slice(8, 10) + "/" + data.dob.slice(5, 7) + "/" + data.dob.slice(0, 4) : "",
          mobile: data.mobile ?? "",
          notes: data.notes ?? "",
        });
        if (data.status !== "AGENT_DRAFT") {
          setError("The office has already started processing this form — it can no longer be edited from here.");
        }
      })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        tanApplicationType: form.tanApplicationType,
        existingTan: form.existingTan || undefined,
        applicantCategory: form.applicantCategory,
        otherCategoryDetail: form.otherCategoryDetail || undefined,
        applicantName: form.applicantName || undefined,
        dob: form.dob || undefined,
        mobile: form.mobile || undefined,
        notes: form.notes || undefined,
      };
      if (isEdit) {
        await api.patch(`/agent-portal/applications/tan/${id}`, payload);
      } else {
        await api.post("/agent-portal/applications/tan", payload);
      }
      navigate("/portal/applications");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="px-6 py-8 text-sm text-slate-500">Loading…</div>;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {isEdit ? "Edit" : "New"} TAN Pre-Entry
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Fill in whatever you already know — nothing here is required. The office will fill in the rest and finalize
          it once they receive the physical form.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Application Type (Optional)</label>
            <select
              value={form.tanApplicationType}
              onChange={(e) => set("tanApplicationType", e.target.value as "NEW" | "CORRECTION")}
              className={inputClass}
            >
              <option value="NEW">New</option>
              <option value="CORRECTION">Correction</option>
            </select>
          </div>
          {form.tanApplicationType === "CORRECTION" && (
            <div>
              <label className={labelClass}>Existing TAN (Optional)</label>
              <input value={form.existingTan} onChange={(e) => set("existingTan", e.target.value.toUpperCase())} className={inputClass} />
            </div>
          )}
          <div>
            <label className={labelClass}>Category (Optional)</label>
            <select
              value={form.applicantCategory}
              onChange={(e) => set("applicantCategory", e.target.value as ApplicantCategory)}
              className={inputClass}
            >
              {(Object.keys(APPLICANT_CATEGORY_LABELS) as ApplicantCategory[]).map((c) => (
                <option key={c} value={c}>
                  {APPLICANT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          {form.applicantCategory === "OTHER" && (
            <div>
              <label className={labelClass}>Category Detail (Optional)</label>
              <input value={form.otherCategoryDetail} onChange={(e) => set("otherCategoryDetail", e.target.value)} className={inputClass} />
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>Applicant Name (Optional)</label>
          <input value={form.applicantName} onChange={(e) => set("applicantName", e.target.value)} className={inputClass} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Date of Incorporation / Birth (Optional)</label>
            <DateInput value={form.dob} onChange={(v) => set("dob", v)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Mobile (Optional)</label>
            <input value={form.mobile} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Notes (Optional)</label>
          <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className={inputClass} />
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => navigate("/portal/applications")}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save Draft"}
          </button>
        </div>
      </form>
    </div>
  );
}
