import { useState } from "react";
import type { FormEvent } from "react";
import { api, extractErrorMessage } from "../../api/client";
import type { AttendanceRecord } from "../../types";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";
const labelClass = "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";

// Attendance times round-trip through Postgres TIME as an epoch-date ISO string. A <input
// type="time"> gives "HH:MM"; we rebuild the same epoch-date ISO shape to send back.
function isoToTimeInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function timeInputToIso(value: string): string | null {
  if (!value) return null;
  return `1970-01-01T${value}:00.000Z`;
}

export function AttendanceOverrideModal({
  record,
  onClose,
  onSaved,
}: {
  record: AttendanceRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [shift1In, setShift1In] = useState(isoToTimeInput(record.shift1In));
  const [shift1Out, setShift1Out] = useState(isoToTimeInput(record.shift1Out));
  const [shift2In, setShift2In] = useState(isoToTimeInput(record.shift2In));
  const [shift2Out, setShift2Out] = useState(isoToTimeInput(record.shift2Out));
  const [overrideNote, setOverrideNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.patch(`/attendance/${record.id}/override`, {
        shift1In: timeInputToIso(shift1In),
        shift1Out: timeInputToIso(shift1Out),
        shift2In: timeInputToIso(shift2In),
        shift2Out: timeInputToIso(shift2Out),
        overrideNote,
      });
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
          Override Attendance — {record.staff?.fullName}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {new Date(record.workDate).toLocaleDateString()}
        </p>

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Shift 1 In</label>
              <input type="time" className={inputClass} value={shift1In} onChange={(e) => setShift1In(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Shift 1 Out</label>
              <input type="time" className={inputClass} value={shift1Out} onChange={(e) => setShift1Out(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Shift 2 In</label>
              <input type="time" className={inputClass} value={shift2In} onChange={(e) => setShift2In(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Shift 2 Out</label>
              <input type="time" className={inputClass} value={shift2Out} onChange={(e) => setShift2Out(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Reason for override (required)</label>
            <textarea
              className={inputClass}
              rows={2}
              value={overrideNote}
              onChange={(e) => setOverrideNote(e.target.value)}
              required
            />
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
              {saving ? "Saving…" : "Save Override"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
