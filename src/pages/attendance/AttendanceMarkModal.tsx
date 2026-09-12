import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, extractErrorMessage } from "../../api/client";
import { ATTENDANCE_STATUS_LABELS } from "../../types";
import type { AttendanceStatus, Staff } from "../../types";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";
const labelClass = "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";

export function AttendanceMarkModal({
  date,
  onClose,
  onSaved,
}: {
  date: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffId, setStaffId] = useState<number | "">("");
  const [shift1In, setShift1In] = useState("");
  const [shift1Out, setShift1Out] = useState("");
  const [shift2In, setShift2In] = useState("");
  const [shift2Out, setShift2Out] = useState("");
  const [status, setStatus] = useState<AttendanceStatus | "">("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Staff[]>("/staff")
      .then(({ data }) => setStaffList(data.filter((s) => s.isActive)))
      .catch((err) => setError(extractErrorMessage(err)));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!staffId) return;
    setError(null);
    setSaving(true);
    try {
      await api.post("/attendance/mark", {
        staffId,
        date,
        shift1In: shift1In || undefined,
        shift1Out: shift1Out || undefined,
        shift2In: shift2In || undefined,
        shift2Out: shift2Out || undefined,
        status: status || undefined,
        note,
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
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Mark Attendance</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{date}</p>

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div>
            <label className={labelClass}>Staff</label>
            <select
              className={inputClass}
              value={staffId}
              onChange={(e) => setStaffId(Number(e.target.value))}
              required
            >
              <option value="" disabled>
                Select…
              </option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              setShift1In("10:00");
              setShift1Out("18:00");
            }}
            className="w-full rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 dark:hover:bg-indigo-900"
          >
            Fill Full Day (10:00 – 18:00)
          </button>

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
            <label className={labelClass}>Status (optional — auto-computed from shift times if left blank)</label>
            <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus)}>
              <option value="">Auto</option>
              {Object.entries(ATTENDANCE_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
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
