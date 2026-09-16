import { useState } from "react";
import type { FormEvent } from "react";
import { api, extractErrorMessage } from "../../api/client";
import { DateInput } from "../../components/DateInput";
import { isoToDdMmYyyy, todayDdMmYyyy } from "../../utils/date";
import type { LedgerEntryType, StaffLedgerEntry } from "../../types";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";
const labelClass = "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";

export function StaffLedgerEntryModal({
  staffId,
  entry,
  onClose,
  onSaved,
}: {
  staffId: number;
  entry?: StaffLedgerEntry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(entry);
  const [type, setType] = useState<LedgerEntryType>(entry?.type ?? "DEBIT");
  const [amount, setAmount] = useState(entry?.amount ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [entryDate, setEntryDate] = useState(entry ? isoToDdMmYyyy(entry.entryDate) : todayDdMmYyyy());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = { staffId, type, amount: Number(amount), note, entryDate };
      if (isEdit) {
        await api.patch(`/staff-ledger/${entry!.id}`, payload);
      } else {
        await api.post("/staff-ledger", payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {isEdit ? "Edit Ledger Entry" : "Add Ledger Entry"}
        </h2>

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div>
            <label className={labelClass}>Type</label>
            <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as LedgerEntryType)}>
              <option value="DEBIT">Debit — staff took money / owes the office</option>
              <option value="CREDIT">Credit — staff repaid / office owes the staff</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Amount (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div>
            <label className={labelClass}>Date</label>
            <DateInput className={inputClass} value={entryDate} onChange={setEntryDate} required />
          </div>

          <div>
            <label className={labelClass}>Note (required)</label>
            <textarea className={inputClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} required />
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
