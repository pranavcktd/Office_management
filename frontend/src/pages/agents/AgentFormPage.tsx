import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { FieldLabel } from "../../components/FieldLabel";
import type { Agent, FeeApplicationType, FeeModuleKey, FeeSignedStatus } from "../../types";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

const FEE_CATEGORIES: Array<{ module: FeeModuleKey; applicationType: FeeApplicationType; signedStatus: FeeSignedStatus; label: string }> = [
  { module: "PAN", applicationType: "NEW", signedStatus: "SIGNATURE", label: "New PAN — Signature" },
  { module: "PAN", applicationType: "NEW", signedStatus: "THUMB", label: "New PAN — Thumb Impression" },
  { module: "PAN", applicationType: "CORRECTION", signedStatus: "SIGNATURE", label: "Correction PAN — Signature" },
  { module: "PAN", applicationType: "CORRECTION", signedStatus: "THUMB", label: "Correction PAN — Thumb Impression" },
  { module: "TAN", applicationType: "NEW", signedStatus: "", label: "New TAN" },
  { module: "TAN", applicationType: "CORRECTION", signedStatus: "", label: "Correction TAN" },
];

function feeKey(module: FeeModuleKey, applicationType: FeeApplicationType, signedStatus: FeeSignedStatus) {
  return `${module}:${applicationType}:${signedStatus}`;
}

interface FormState {
  agentName: string;
  firmName: string;
  mobile: string;
  email: string;
  address: string;
  notes: string;
  enablePortalAccess: boolean;
}

const initialState: FormState = {
  agentName: "",
  firmName: "",
  mobile: "",
  email: "",
  address: "",
  notes: "",
  enablePortalAccess: false,
};

export function AgentFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormState>(initialState);
  const [feeRates, setFeeRates] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get<Agent>(`/agents/${id}`)
      .then(({ data }) => {
        setForm({
          agentName: data.agentName,
          firmName: data.firmName ?? "",
          mobile: data.mobile,
          email: data.email ?? "",
          address: data.address ?? "",
          notes: data.notes ?? "",
          enablePortalAccess: Boolean(data.hasPortalAccess),
        });
        setFeeRates(
          Object.fromEntries(
            (data.feeRates ?? []).map((r) => [feeKey(r.module, r.applicationType, r.signedStatus), r.amount === null ? "" : String(r.amount)])
          )
        );
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
        agentName: form.agentName,
        firmName: form.firmName || undefined,
        mobile: form.mobile,
        email: form.email || undefined,
        address: form.address || undefined,
        notes: form.notes || undefined,
        enablePortalAccess: form.enablePortalAccess || undefined,
        feeRates: FEE_CATEGORIES.map((c) => {
          const raw = feeRates[feeKey(c.module, c.applicationType, c.signedStatus)];
          return {
            module: c.module,
            applicationType: c.applicationType,
            signedStatus: c.signedStatus,
            amount: raw ? Number(raw) : null,
          };
        }),
      };
      if (isEdit) {
        await api.patch(`/agents/${id}`, payload);
      } else {
        await api.post("/agents", payload);
      }
      navigate("/agents");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="px-6 py-8 text-sm text-slate-500">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        {isEdit ? `Edit Agent #${id}` : "New Agent"}
      </h1>

      <form onSubmit={onSubmit} className="mt-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel required>Agent Name</FieldLabel>
            <input
              autoFocus
              className={inputClass}
              value={form.agentName}
              onChange={(e) => set("agentName", e.target.value)}
              required
            />
          </div>
          <div>
            <FieldLabel required={false}>Firm Name</FieldLabel>
            <input
              className={inputClass}
              value={form.firmName}
              onChange={(e) => set("firmName", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
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
          <div>
            <FieldLabel required={form.enablePortalAccess}>
              Email {form.enablePortalAccess && <span className="font-normal text-slate-400">(used to sign in)</span>}
            </FieldLabel>
            <input
              type="email"
              className={inputClass}
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              required={form.enablePortalAccess}
            />
          </div>
        </div>

        <div>
          <FieldLabel required={false}>Office Address</FieldLabel>
          <input
            className={inputClass}
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
          />
        </div>

        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.enablePortalAccess}
              disabled={form.enablePortalAccess && isEdit}
              onChange={(e) => set("enablePortalAccess", e.target.checked)}
            />
            Enable agent portal login
          </label>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {form.enablePortalAccess && isEdit
              ? "Portal access is already enabled — use \"Reset Password\" from the agent list to issue a new one."
              : "The account will start on the office default password and must be changed on first login."}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <p className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            This Agent's Fee Rates <span className="font-normal text-slate-400">(Optional)</span>
          </p>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Leave a rate blank to use the office's walk-in default for that category. When a PAN/TAN
            entry is logged for this agent, the system compares what was actually collected against
            this rate to track the credit/debit due.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {FEE_CATEGORIES.map((c) => {
              const key = feeKey(c.module, c.applicationType, c.signedStatus);
              return (
                <div key={key}>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{c.label}</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={inputClass}
                    placeholder="Office default"
                    value={feeRates[key] ?? ""}
                    onChange={(e) => setFeeRates((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <FieldLabel required={false}>Notes</FieldLabel>
          <textarea
            className={inputClass}
            rows={3}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
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
            {submitting ? "Saving…" : isEdit ? "Save Changes" : "Save Agent"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/agents")}
            className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
