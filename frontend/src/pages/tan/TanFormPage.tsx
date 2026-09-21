import { useEffect, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { AdjustmentLookupModal } from "../../components/AdjustmentLookupModal";
import { DateInput } from "../../components/DateInput";
import { FieldLabel } from "../../components/FieldLabel";
import { useFieldRequirements } from "../../hooks/useFieldRequirements";
import { useStandardFee } from "../../hooks/useStandardFee";
import { isoToDdMmYyyy, todayDdMmYyyy } from "../../utils/date";
import { getTanFormNumber } from "../../utils/formNumbers";
import { APPLICANT_CATEGORY_LABELS } from "../../types";
import type {
  AdjustmentCandidate,
  Agent,
  ApplicantCategory,
  ApplicationType,
  PaymentMode,
  SourceType,
  Staff,
  TanApplication,
} from "../../types";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

interface FormState {
  applicantCategory: ApplicantCategory;
  otherCategoryDetail: string;
  applicantName: string;
  dob: string;
  mobile: string;
  tanApplicationType: ApplicationType;
  existingTan: string;
  sourceType: SourceType;
  agentId: string;
  feeAmount: string;
  paymentMode: PaymentMode;
  paymentOtherDetail: string;
  onlinePaymentDetail: string;
  cashReceivedById: string;
  adjustedFromFormId: string;
  adjustedFromLabel: string;
  formReceivedDate: string;
  notes: string;
}

const initialState: FormState = {
  applicantCategory: "INDIVIDUAL",
  otherCategoryDetail: "",
  applicantName: "",
  dob: "",
  mobile: "",
  tanApplicationType: "NEW",
  existingTan: "",
  sourceType: "OFFICE",
  agentId: "",
  feeAmount: "",
  paymentMode: "CASH",
  paymentOtherDetail: "",
  onlinePaymentDetail: "",
  cashReceivedById: "",
  adjustedFromFormId: "",
  adjustedFromLabel: "",
  formReceivedDate: todayDdMmYyyy(),
  notes: "",
};

// Enter moves to the next field instead of submitting — keeps counter staff on the keyboard.
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

export function TanFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormState>(initialState);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const { isRequired } = useFieldRequirements("TAN");
  const standardFee = useStandardFee({
    module: "tan",
    applicationType: form.tanApplicationType,
    sourceType: form.sourceType,
    agentId: form.agentId,
  });

  useEffect(() => {
    api
      .get<Agent[]>("/agents", { params: { status: "ACTIVE" } })
      .then(({ data }) => setAgents(data))
      .catch(() => setAgents([]));
    api
      .get<Staff[]>("/staff")
      .then(({ data }) => setStaffList(data.filter((s) => s.isActive)))
      .catch(() => setStaffList([]));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get<TanApplication>(`/tan/${id}`)
      .then(({ data }) => {
        setForm({
          applicantCategory: data.applicantCategory,
          otherCategoryDetail: data.otherCategoryDetail ?? "",
          applicantName: data.applicantName,
          dob: isoToDdMmYyyy(data.dob),
          mobile: data.mobile ?? "",
          tanApplicationType: data.applicationType,
          existingTan: data.existingTan ?? "",
          sourceType: data.sourceType,
          agentId: data.agentId ? String(data.agentId) : "",
          feeAmount: data.feeAmount,
          paymentMode: data.paymentMode,
          paymentOtherDetail: data.paymentOtherDetail ?? "",
          onlinePaymentDetail: data.onlinePaymentDetail ?? "",
          cashReceivedById: data.cashReceivedById ? String(data.cashReceivedById) : "",
          adjustedFromFormId: "",
          adjustedFromLabel: "",
          formReceivedDate: isoToDdMmYyyy(data.formReceivedDate),
          notes: data.notes ?? "",
        });
      })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const lookupKeyReady =
    form.sourceType === "AGENT" ? Boolean(form.agentId) : Boolean(form.mobile || form.applicantName);

  function onPaymentModeChange(mode: PaymentMode) {
    set("paymentMode", mode);
    set("adjustedFromFormId", "");
    set("adjustedFromLabel", "");
    if (mode === "ADJUSTED" && lookupKeyReady) {
      setShowAdjustmentModal(true);
    }
  }

  function onCandidateSelected(candidate: AdjustmentCandidate) {
    set("adjustedFromFormId", String(candidate.id));
    set("adjustedFromLabel", `#${candidate.id} — ${candidate.applicantName} (₹${candidate.feeAmount})`);
    setShowAdjustmentModal(false);
  }

  const adjustedLinkMissing = !isEdit && form.paymentMode === "ADJUSTED" && !form.adjustedFromFormId;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (adjustedLinkMissing) {
      setError("Select a rejected form to adjust before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit) {
        await api.patch(`/tan/${id}`, {
          tanApplicationType: form.tanApplicationType,
          existingTan: form.tanApplicationType === "CORRECTION" ? form.existingTan : undefined,
          applicantCategory: form.applicantCategory,
          otherCategoryDetail: form.applicantCategory === "OTHER" ? form.otherCategoryDetail : undefined,
          applicantName: form.applicantName || undefined,
          dob: form.dob || undefined,
          mobile: form.mobile || undefined,
          sourceType: form.sourceType,
          agentId: form.sourceType === "AGENT" ? Number(form.agentId) : undefined,
          feeAmount: form.feeAmount ? Number(form.feeAmount) : undefined,
          formReceivedDate: form.formReceivedDate,
          notes: form.notes || undefined,
        });
        navigate(`/tan/${id}`);
      } else {
        await api.post("/tan", {
          applicantCategory: form.applicantCategory,
          otherCategoryDetail: form.applicantCategory === "OTHER" ? form.otherCategoryDetail : undefined,
          applicantName: form.applicantName || undefined,
          dob: form.dob || undefined,
          mobile: form.mobile || undefined,
          tanApplicationType: form.tanApplicationType,
          existingTan: form.tanApplicationType === "CORRECTION" ? form.existingTan : undefined,
          sourceType: form.sourceType,
          agentId: form.sourceType === "AGENT" ? Number(form.agentId) : undefined,
          feeAmount: form.feeAmount ? Number(form.feeAmount) : undefined,
          paymentMode: form.paymentMode,
          paymentOtherDetail: form.paymentMode === "OTHER" ? form.paymentOtherDetail : undefined,
          onlinePaymentDetail: form.paymentMode === "ONLINE" ? form.onlinePaymentDetail : undefined,
          cashReceivedById: form.paymentMode === "CASH" ? Number(form.cashReceivedById) : undefined,
          adjustedFromFormId:
            form.paymentMode === "ADJUSTED" ? Number(form.adjustedFromFormId) : undefined,
          formReceivedDate: form.formReceivedDate,
          notes: form.notes || undefined,
        });
        navigate("/tan");
      }
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
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        {isEdit ? `Edit TAN Application #${id}` : "New TAN Application"}
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Tab or Enter moves between fields — no mouse required.
      </p>

      <form onSubmit={onSubmit} onKeyDown={handleFormKeyDown} className="mt-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel required>Category</FieldLabel>
            <select
              autoFocus
              className={inputClass}
              value={form.applicantCategory}
              onChange={(e) => set("applicantCategory", e.target.value as ApplicantCategory)}
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
              <FieldLabel required>Category Detail</FieldLabel>
              <input
                className={inputClass}
                value={form.otherCategoryDetail}
                onChange={(e) => set("otherCategoryDetail", e.target.value.toUpperCase())}
                required
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel required={isRequired("applicantName")}>Name</FieldLabel>
            <input
              className={inputClass}
              value={form.applicantName}
              onChange={(e) => set("applicantName", e.target.value.toUpperCase())}
              required={isRequired("applicantName")}
            />
          </div>
          <div>
            <FieldLabel required={isRequired("dob")}>Date of Incorporation / Birth</FieldLabel>
            <DateInput className={inputClass} value={form.dob} onChange={(v) => set("dob", v)} required={isRequired("dob")} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel required={isRequired("mobile")}>Mobile Number</FieldLabel>
            <input
              className={inputClass}
              placeholder="10 digits"
              inputMode="numeric"
              maxLength={10}
              value={form.mobile}
              onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))}
              required={isRequired("mobile")}
            />
          </div>
          <div>
            <FieldLabel required>Application Type</FieldLabel>
            <select
              className={inputClass}
              value={form.tanApplicationType}
              onChange={(e) => set("tanApplicationType", e.target.value as ApplicationType)}
            >
              <option value="NEW">New</option>
              <option value="CORRECTION">Correction</option>
            </select>
          </div>
        </div>

        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
          This application will be filed as{" "}
          <span className="font-semibold">{getTanFormNumber(form.tanApplicationType, form.applicantCategory)}</span>.
        </p>

        {form.tanApplicationType === "CORRECTION" && (
          <div>
            <FieldLabel required>Existing TAN</FieldLabel>
            <input
              className={inputClass}
              value={form.existingTan}
              onChange={(e) => set("existingTan", e.target.value.toUpperCase())}
              maxLength={10}
              required
            />
          </div>
        )}

        <div>
          <FieldLabel required>Form Source</FieldLabel>
          <select
            className={inputClass}
            value={form.sourceType}
            onChange={(e) => set("sourceType", e.target.value as SourceType)}
          >
            <option value="OFFICE">Office Walk-in</option>
            <option value="AGENT">Agent</option>
          </select>
        </div>

        {form.sourceType === "AGENT" && (
          <div>
            <FieldLabel required>Agent</FieldLabel>
            <select
              className={inputClass}
              value={form.agentId}
              onChange={(e) => set("agentId", e.target.value)}
              required
            >
              <option value="" disabled>
                Select an agent…
              </option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.agentName} {a.firmName ? `(${a.firmName})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {standardFee !== null && (
          <p className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
            Standard fee for this category: <span className="font-semibold">₹{standardFee}</span>
          </p>
        )}

        {!isEdit && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Payment Mode</FieldLabel>
              <select
                className={inputClass}
                value={form.paymentMode}
                onChange={(e) => onPaymentModeChange(e.target.value as PaymentMode)}
              >
                <option value="CASH">Cash</option>
                <option value="ONLINE">Online</option>
                <option value="OTHER">Other</option>
                <option value="ADJUSTED">Adjusted (against a rejected form)</option>
              </select>
            </div>
            {form.paymentMode === "ONLINE" && (
              <div>
                <FieldLabel required>Paid To (UPI / Account / Person)</FieldLabel>
                <input
                  className={inputClass}
                  value={form.onlinePaymentDetail}
                  onChange={(e) => set("onlinePaymentDetail", e.target.value)}
                  required
                />
              </div>
            )}
            {form.paymentMode === "OTHER" && (
              <div>
                <FieldLabel required>Please specify</FieldLabel>
                <input
                  className={inputClass}
                  value={form.paymentOtherDetail}
                  onChange={(e) => set("paymentOtherDetail", e.target.value)}
                  required
                />
              </div>
            )}
            {form.paymentMode === "CASH" && (
              <div>
                <FieldLabel required>Cash Received By</FieldLabel>
                <select
                  className={inputClass}
                  value={form.cashReceivedById}
                  onChange={(e) => set("cashReceivedById", e.target.value)}
                  required
                >
                  <option value="">Select staff…</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel required={isRequired("feeAmount") && form.paymentMode !== "ADJUSTED"}>
              Fees Paid
              {form.paymentMode === "ADJUSTED" && (
                <span className="ml-1 font-normal text-slate-400">(optional — covered by the adjustment credit)</span>
              )}
            </FieldLabel>
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputClass}
              value={form.feeAmount}
              onChange={(e) => set("feeAmount", e.target.value)}
              required={isRequired("feeAmount") && form.paymentMode !== "ADJUSTED"}
            />
          </div>
          <div>
            <FieldLabel required>Form Received Date</FieldLabel>
            <DateInput
              className={inputClass}
              value={form.formReceivedDate}
              onChange={(v) => set("formReceivedDate", v)}
              required
            />
          </div>
        </div>

        {!isEdit && form.paymentMode === "ADJUSTED" && (
          <div
            className={`rounded-lg border px-3 py-2.5 text-sm ${
              adjustedLinkMissing
                ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
            }`}
          >
            {form.adjustedFromLabel ? (
              <>
                <span>Adjusting against {form.adjustedFromLabel}</span>{" "}
                <button
                  type="button"
                  onClick={() => setShowAdjustmentModal(true)}
                  className="font-medium underline underline-offset-2"
                >
                  Change
                </button>
              </>
            ) : (
              <>
                <span>No rejected form linked yet.</span>{" "}
                <button
                  type="button"
                  onClick={() => setShowAdjustmentModal(true)}
                  className="font-medium underline underline-offset-2"
                >
                  Choose rejected form
                </button>
              </>
            )}
          </div>
        )}

        <div>
          <FieldLabel required={isRequired("notes")}>Notes</FieldLabel>
          <textarea
            className={inputClass}
            rows={3}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value.toUpperCase())}
            required={isRequired("notes")}
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
            {submitting ? "Saving…" : isEdit ? "Save Changes" : "Save Application"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/tan")}
            className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      </form>

      {showAdjustmentModal && (
        <AdjustmentLookupModal
          apiPath="/tan/adjustment-candidates"
          initialSourceType={form.sourceType}
          initialAgentId={form.agentId ? Number(form.agentId) : undefined}
          initialKeyword={form.mobile || form.applicantName}
          onSelect={onCandidateSelected}
          onClose={() => setShowAdjustmentModal(false)}
        />
      )}
    </div>
  );
}
