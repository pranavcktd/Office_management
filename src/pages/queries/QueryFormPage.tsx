import { useEffect, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { CategorySelect } from "../../components/CategorySelect";
import { FieldLabel } from "../../components/FieldLabel";
import { QUERY_EXTRA_FIELD_LABELS } from "../../types";
import type { ClientQuery, MasterCategory } from "../../types";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

interface FormState {
  clientName: string;
  mobile: string;
  email: string;
  serviceCategoryId: number | "";
  panNumber: string;
  aadhaarNumber: string;
  taxYear: string;
  queryText: string;
}

const initialState: FormState = {
  clientName: "",
  mobile: "",
  email: "",
  serviceCategoryId: "",
  panNumber: "",
  aadhaarNumber: "",
  taxYear: "",
  queryText: "",
};

function handleFormKeyDown(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key !== "Enter") return;
  const target = e.target as HTMLElement;
  if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return;
  e.preventDefault();
  const focusable = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])"
    )
  ).filter((el) => el.offsetParent !== null);
  const idx = focusable.indexOf(target);
  const next = focusable[idx + 1];
  if (next) {
    next.focus();
    if (next instanceof HTMLInputElement) next.select();
  }
}

export function QueryFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormState>(initialState);
  const [existingAadhaarNumber, setExistingAadhaarNumber] = useState<string | null>(null);
  const [categories, setCategories] = useState<MasterCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get<MasterCategory[]>("/master/SERVICE")
      .then(({ data }) => setCategories(data))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get<ClientQuery>(`/queries/${id}`)
      .then(({ data }) => {
        setForm({
          clientName: data.clientName,
          mobile: data.mobile,
          email: data.email ?? "",
          serviceCategoryId: data.serviceCategoryId,
          panNumber: data.panNumber ?? "",
          aadhaarNumber: "",
          taxYear: data.taxYear ?? "",
          queryText: data.queryText,
        });
        setExistingAadhaarNumber(data.aadhaarNumber ?? null);
      })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const selectedCategory = categories.find((c) => c.id === form.serviceCategoryId);
  const requiredFields = selectedCategory?.requiredQueryFields ?? [];

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.serviceCategoryId === "") {
      setError("Pick a service category.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        clientName: form.clientName,
        mobile: form.mobile,
        email: form.email || undefined,
        serviceCategoryId: form.serviceCategoryId,
        panNumber: requiredFields.includes("PAN") ? form.panNumber || undefined : undefined,
        aadhaarNumber: requiredFields.includes("AADHAAR") ? form.aadhaarNumber || undefined : undefined,
        taxYear: requiredFields.includes("TAX_YEAR") ? form.taxYear || undefined : undefined,
        queryText: form.queryText,
      };
      if (isEdit) {
        await api.patch(`/queries/${id}/edit`, payload);
        navigate(`/queries/${id}`);
      } else {
        await api.post("/queries", payload);
        navigate("/queries");
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="px-6 py-8 text-sm text-slate-500">Loading…</div>;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        {isEdit ? `Edit Query #${id}` : "New Client Query"}
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Tab or Enter moves between fields.
      </p>

      <form onSubmit={onSubmit} onKeyDown={handleFormKeyDown} className="mt-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel required>Client Name</FieldLabel>
            <input
              autoFocus
              className={inputClass}
              value={form.clientName}
              onChange={(e) => set("clientName", e.target.value)}
              required
            />
          </div>
          <div>
            <FieldLabel required>Mobile Number</FieldLabel>
            <input
              className={inputClass}
              placeholder="10 digits"
              inputMode="numeric"
              maxLength={10}
              value={form.mobile}
              onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel required={false}>Email</FieldLabel>
            <input
              type="email"
              className={inputClass}
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
          <div>
            <FieldLabel required>Service Category</FieldLabel>
            <CategorySelect
              kind="SERVICE"
              value={form.serviceCategoryId}
              onChange={(v) => set("serviceCategoryId", v)}
              className={inputClass}
              required
            />
          </div>
        </div>

        {requiredFields.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            {requiredFields.includes("PAN") && (
              <div>
                <FieldLabel required>{QUERY_EXTRA_FIELD_LABELS.PAN}</FieldLabel>
                <input
                  className={inputClass}
                  maxLength={10}
                  value={form.panNumber}
                  onChange={(e) => set("panNumber", e.target.value.toUpperCase())}
                  required
                />
              </div>
            )}
            {requiredFields.includes("AADHAAR") && (
              <div>
                <FieldLabel required={!existingAadhaarNumber}>{QUERY_EXTRA_FIELD_LABELS.AADHAAR}</FieldLabel>
                <input
                  className={inputClass}
                  placeholder={existingAadhaarNumber ? `On file: ${existingAadhaarNumber} — leave blank to keep` : "12 digits"}
                  inputMode="numeric"
                  maxLength={12}
                  value={form.aadhaarNumber}
                  onChange={(e) => set("aadhaarNumber", e.target.value.replace(/\D/g, "").slice(0, 12))}
                  required={!existingAadhaarNumber}
                />
              </div>
            )}
            {requiredFields.includes("TAX_YEAR") && (
              <div>
                <FieldLabel required>{QUERY_EXTRA_FIELD_LABELS.TAX_YEAR}</FieldLabel>
                <input
                  className={inputClass}
                  placeholder="e.g. 2024-25"
                  value={form.taxYear}
                  onChange={(e) => set("taxYear", e.target.value)}
                  required
                />
              </div>
            )}
          </div>
        )}

        <div>
          <FieldLabel required>Query Description</FieldLabel>
          <textarea
            className={inputClass}
            rows={4}
            value={form.queryText}
            onChange={(e) => set("queryText", e.target.value)}
            required
          />
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {submitting ? "Saving…" : isEdit ? "Save Changes" : "Save Query"}
          </button>
          <button
            type="button"
            onClick={() => navigate(isEdit ? `/queries/${id}` : "/queries")}
            className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
