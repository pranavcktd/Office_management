import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { FieldLabel } from "../../components/FieldLabel";
import type { Agent, AgentEmailEntry, FeeApplicationType, FeeModuleKey, FeeSignedStatus } from "../../types";

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

/** An agent can go by more than one email (different clients/businesses); exactly one is used
 * for portal login. Saves as its own independent action — a different endpoint than the rest of
 * the agent form — and surfaces how many existing PAN applications got auto-claimed by a newly
 * added address (walk-in/imported forms that already carried that email but weren't tagged to
 * an agent yet). */
function AgentEmailsSection({ agentId, initialEmails }: { agentId: string; initialEmails: AgentEmailEntry[] }) {
  const [rows, setRows] = useState<Array<{ email: string; isLogin: boolean }>>(
    initialEmails.length > 0 ? initialEmails.map((e) => ({ email: e.email, isLogin: e.isLogin })) : [{ email: "", isLogin: true }]
  );
  const [saving, setSaving] = useState(false);
  const [remapping, setRemapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function updateRow(index: number, email: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, email } : r)));
  }

  function setDefault(index: number) {
    setRows((prev) => prev.map((r, i) => ({ ...r, isLogin: i === index })));
  }

  function removeRow(index: number) {
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // Removing the current default — fall back to the first remaining row so exactly one
      // is always marked, matching what the backend requires.
      if (prev[index]?.isLogin && next.length > 0 && !next.some((r) => r.isLogin)) {
        next[0] = { ...next[0], isLogin: true };
      }
      return next;
    });
  }

  function addRow() {
    setRows((prev) => [...prev, { email: "", isLogin: prev.length === 0 }]);
  }

  async function onSave() {
    setError(null);
    setNotice(null);
    const emails = rows.map((r) => ({ ...r, email: r.email.trim() })).filter((r) => r.email);
    if (emails.length === 0) {
      setError("At least one email is required.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put<{ emails: AgentEmailEntry[]; mappedCount: number }>(`/agents/${agentId}/emails`, { emails });
      setRows(data.emails.map((e) => ({ email: e.email, isLogin: e.isLogin })));
      setNotice(
        data.mappedCount > 0
          ? `Saved. ${data.mappedCount} existing PAN application${data.mappedCount === 1 ? "" : "s"} matching a newly added email ${data.mappedCount === 1 ? "was" : "were"} automatically linked to this agent.`
          : "Saved."
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function onRemap() {
    setError(null);
    setNotice(null);
    setRemapping(true);
    try {
      const { data } = await api.post<{ mappedCount: number }>(`/agents/${agentId}/emails/remap`);
      setNotice(
        data.mappedCount > 0
          ? `${data.mappedCount} existing PAN application${data.mappedCount === 1 ? "" : "s"} matching a registered email ${data.mappedCount === 1 ? "was" : "were"} linked to this agent.`
          : "No unassigned applications matched this agent's emails."
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setRemapping(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <p className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">Agent Emails</p>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        An agent can have more than one email on file. Pick which one is used for portal login —
        the rest are just recognized as belonging to this agent. Adding an email automatically
        links any existing PAN application already on file with that email (that isn't already
        tied to an agent) to this agent's portal. The same email can't be registered to more than
        one agent.
      </p>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name="agent-default-email"
              checked={row.isLogin}
              onChange={() => setDefault(i)}
              title="Use for portal login"
            />
            <input
              type="email"
              className={inputClass}
              placeholder="agent@example.com"
              value={row.email}
              onChange={(e) => updateRow(i, e.target.value)}
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              disabled={rows.length === 1}
              title="Remove"
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              🗑
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="mt-2 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
      >
        + Add another email
      </button>

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>
      )}
      {notice && (
        <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{notice}</p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Emails"}
        </button>
        <button
          type="button"
          onClick={onRemap}
          disabled={remapping}
          title="Re-check unassigned PAN applications against this agent's saved emails — use this if new matching applications arrived since you last saved"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {remapping ? "Checking…" : "🔄 Refresh Mapping"}
        </button>
      </div>
    </div>
  );
}

export function AgentFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormState>(initialState);
  const [feeRates, setFeeRates] = useState<Record<string, string>>({});
  const [agentEmails, setAgentEmails] = useState<AgentEmailEntry[]>([]);
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
        setAgentEmails(data.emails ?? []);
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

        {isEdit && <AgentEmailsSection agentId={id!} initialEmails={agentEmails} />}

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
