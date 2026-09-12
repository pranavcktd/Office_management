import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { CategorySelect } from "../../components/CategorySelect";
import { FieldLabel } from "../../components/FieldLabel";
import { COURIER_AGENCY_LABELS } from "../../types";
import type { CourierAgency, DispatchEntry, DispatchEntryType } from "../../types";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

interface FormState {
  entryType: DispatchEntryType;
  itemCategoryId: number | "";
  courierAgency: CourierAgency;
  courierOtherDetail: string;
  courierDetails: string;
  consignmentNumber: string;
  partyDetails: string;
  mobile: string;
}

const initialState: FormState = {
  entryType: "INWARD",
  itemCategoryId: "",
  courierAgency: "BY_HAND",
  courierOtherDetail: "",
  courierDetails: "",
  consignmentNumber: "",
  partyDetails: "",
  mobile: "",
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

export function DispatchFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormState>(initialState);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [existingReceipt, setExistingReceipt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get<DispatchEntry>(`/dispatch/${id}`)
      .then(({ data }) => {
        setForm({
          entryType: data.entryType,
          itemCategoryId: data.itemCategoryId,
          courierAgency: data.courierAgency ?? "BY_HAND",
          courierOtherDetail: data.courierOtherDetail ?? "",
          courierDetails: data.courierDetails ?? "",
          consignmentNumber: data.consignmentNumber ?? "",
          partyDetails: data.partyDetails,
          mobile: data.mobile ?? "",
        });
        setExistingReceipt(Boolean(data.receiptPath));
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
    if (form.itemCategoryId === "") {
      setError("Pick an item type.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        entryType: form.entryType,
        itemCategoryId: form.itemCategoryId,
        courierAgency: form.courierAgency,
        courierOtherDetail: form.courierAgency === "OTHER" ? form.courierOtherDetail : undefined,
        courierDetails: form.courierDetails || undefined,
        consignmentNumber: form.courierAgency === "BY_HAND" ? undefined : form.consignmentNumber,
        partyDetails: form.partyDetails,
        mobile: form.mobile || undefined,
      };
      const { data } = isEdit
        ? await api.patch<DispatchEntry>(`/dispatch/${id}`, payload)
        : await api.post<DispatchEntry>("/dispatch", payload);

      if (receiptFile) {
        const fd = new FormData();
        fd.append("receipt", receiptFile);
        await api.post(`/dispatch/${data.id}/receipt`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      navigate(isEdit ? `/dispatch/${id}` : "/dispatch");
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
        {isEdit ? `Edit Register Entry #${id}` : "New Register Entry"}
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Tab or Enter moves between fields — no mouse required.
      </p>

      <form onSubmit={onSubmit} onKeyDown={handleFormKeyDown} className="mt-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel required>Entry Type</FieldLabel>
            <select
              autoFocus
              className={inputClass}
              value={form.entryType}
              onChange={(e) => set("entryType", e.target.value as DispatchEntryType)}
            >
              <option value="INWARD">Inward (Received)</option>
              <option value="OUTWARD">Outward (Dispatched)</option>
            </select>
          </div>
          <div>
            <FieldLabel required>Item Type</FieldLabel>
            <CategorySelect
              kind="DISPATCH_ITEM"
              value={form.itemCategoryId}
              onChange={(v) => set("itemCategoryId", v)}
              className={inputClass}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel required>Courier Agency</FieldLabel>
            <select
              className={inputClass}
              value={form.courierAgency}
              onChange={(e) => set("courierAgency", e.target.value as CourierAgency)}
            >
              {(Object.keys(COURIER_AGENCY_LABELS) as CourierAgency[]).map((c) => (
                <option key={c} value={c}>
                  {COURIER_AGENCY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          {form.courierAgency !== "BY_HAND" && (
            <div>
              <FieldLabel required>Consignment Number (AWB)</FieldLabel>
              <input
                className={inputClass}
                value={form.consignmentNumber}
                onChange={(e) => set("consignmentNumber", e.target.value)}
                required
              />
            </div>
          )}
        </div>

        {form.courierAgency === "OTHER" && (
          <div>
            <FieldLabel required>Please specify courier</FieldLabel>
            <input
              className={inputClass}
              value={form.courierOtherDetail}
              onChange={(e) => set("courierOtherDetail", e.target.value)}
              required
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel required>
              {form.entryType === "INWARD" ? "Sender (Party Name & Address)" : "Receiver (Party Name & Address)"}
            </FieldLabel>
            <textarea
              className={inputClass}
              rows={2}
              value={form.partyDetails}
              onChange={(e) => set("partyDetails", e.target.value)}
              required
            />
          </div>
          <div>
            <FieldLabel required={false}>Mobile Number</FieldLabel>
            <input
              className={inputClass}
              placeholder="10 digits"
              inputMode="numeric"
              maxLength={10}
              value={form.mobile}
              onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
          </div>
        </div>

        <div>
          <FieldLabel required={false}>Details of Courier</FieldLabel>
          <textarea
            className={inputClass}
            rows={2}
            value={form.courierDetails}
            onChange={(e) => set("courierDetails", e.target.value)}
            placeholder="Tracking notes, delivery instructions, etc."
          />
        </div>

        <div>
          <FieldLabel required={false}>
            Receipt (PDF or image)
            {isEdit && existingReceipt && !receiptFile && (
              <span className="ml-1 font-normal text-slate-400">— one already attached; picking a file replaces it</span>
            )}
          </FieldLabel>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
            className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-slate-200"
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
            {submitting ? "Saving…" : isEdit ? "Save Changes" : "Save Entry"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/dispatch")}
            className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
