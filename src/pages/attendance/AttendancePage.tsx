import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { ExportButtons } from "../../components/ExportButtons";
import { ATTENDANCE_STATUS_LABELS } from "../../types";
import type { AttendanceRecord, AttendanceStatus } from "../../types";
import { formatTimeOfDay, todayYyyyMmDd } from "../../utils/date";
import { AttendanceMarkModal } from "./AttendanceMarkModal";
import { AttendanceOverrideModal } from "./AttendanceOverrideModal";

const STATUS_BADGE: Record<AttendanceStatus, string> = {
  PRESENT: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  HALF_DAY: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  ABSENT: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300",
  OVERTIME: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
};

const PUNCH_BUTTONS: Array<{ shift: 1 | 2; type: "IN" | "OUT"; label: string; field: keyof AttendanceRecord }> = [
  { shift: 1, type: "IN", label: "Shift 1 In", field: "shift1In" },
  { shift: 1, type: "OUT", label: "Shift 1 Out", field: "shift1Out" },
  { shift: 2, type: "IN", label: "Shift 2 In", field: "shift2In" },
  { shift: 2, type: "OUT", label: "Shift 2 Out", field: "shift2Out" },
];

export function AttendancePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [date, setDate] = useState(todayYyyyMmDd());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [punching, setPunching] = useState<string | null>(null);
  const [markingFullDay, setMarkingFullDay] = useState(false);
  const [overrideRecord, setOverrideRecord] = useState<AttendanceRecord | null>(null);
  const [showMarkModal, setShowMarkModal] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<AttendanceRecord[]>("/attendance/daily", { params: { date } });
      setRecords(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const myRecord = records.find((r) => r.staffId === user?.id) ?? null;
  const today = todayYyyyMmDd();
  const isToday = date === today;
  const isFuture = date > today;

  async function onPunch(shift: 1 | 2, type: "IN" | "OUT") {
    setPunching(`${shift}-${type}`);
    setError(null);
    try {
      await api.post("/attendance/punch", { shift, type });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setPunching(null);
    }
  }

  async function onMarkFullDay() {
    setMarkingFullDay(true);
    setError(null);
    try {
      await api.post("/attendance/mark-full-day");
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setMarkingFullDay(false);
    }
  }

  function shiftDate(deltaDays: number) {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + deltaDays);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setDate(next > today ? today : next);
  }

  const summary = {
    PRESENT: records.filter((r) => r.status === "PRESENT").length,
    HALF_DAY: records.filter((r) => r.status === "HALF_DAY").length,
    ABSENT: records.filter((r) => r.status === "ABSENT").length,
    OVERTIME: records.filter((r) => r.status === "OVERTIME").length,
  };

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Attendance</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Dual-shift punch & daily team status</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <button
              onClick={() => setShowMarkModal(true)}
              disabled={isFuture}
              title={isFuture ? "Cannot mark attendance for a future date" : undefined}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Mark Attendance
            </button>
          )}
          <Link
            to="/attendance/monthly"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Monthly Report
          </Link>
        </div>
      </div>

      {isToday && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            My punch — today
            {myRecord && (
              <span className={`ml-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[myRecord.status]}`}>
                {ATTENDANCE_STATUS_LABELS[myRecord.status]}
              </span>
            )}
          </h2>
          <div className="grid grid-cols-4 gap-3">
            {PUNCH_BUTTONS.map((btn) => {
              const alreadyPunched = Boolean(myRecord?.[btn.field]);
              return (
                <button
                  key={btn.label}
                  onClick={() => onPunch(btn.shift, btn.type)}
                  disabled={alreadyPunched || punching !== null}
                  className={`rounded-lg border px-3 py-3 text-sm font-medium transition disabled:opacity-60 ${
                    alreadyPunched
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  {alreadyPunched ? (
                    <>
                      {btn.label}
                      <span className="mt-1 block text-xs font-normal">
                        {formatTimeOfDay(myRecord?.[btn.field] as string | null)}
                      </span>
                    </>
                  ) : punching === `${btn.shift}-${btn.type}` ? (
                    "Punching…"
                  ) : (
                    btn.label
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <button
              onClick={onMarkFullDay}
              disabled={Boolean(myRecord?.shift1In || myRecord?.shift1Out) || markingFullDay || punching !== null}
              className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 dark:hover:bg-indigo-900"
            >
              {markingFullDay ? "Marking…" : "Mark Full Day"}
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Worked the whole day, not in separate shifts? One click marks it present (10:00 AM – 6:00 PM) — no need to punch in and out.
            </p>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftDate(-1)}
            title="Previous day"
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            ←
          </button>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value > today ? today : e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <button
            onClick={() => shiftDate(1)}
            disabled={isToday}
            title="Next day"
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            →
          </button>
          {!isToday && (
            <button
              onClick={() => setDate(today)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:border-slate-700 dark:text-indigo-400 dark:hover:bg-indigo-950"
            >
              Today
            </button>
          )}
        </div>
        <ExportButtons exportPath="/attendance/daily/export" params={{ date }} />
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {!loading && records.length > 0 && (
        <div className="mb-4 grid grid-cols-4 gap-3">
          {(Object.keys(ATTENDANCE_STATUS_LABELS) as AttendanceStatus[]).map((s) => (
            <div key={s} className="rounded-lg bg-slate-50 p-3 text-center dark:bg-slate-800">
              <div className="text-xl font-semibold text-slate-900 dark:text-slate-100">{summary[s]}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{ATTENDANCE_STATUS_LABELS[s]}</div>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Shift 1 In</th>
              <th className="px-4 py-3">Shift 1 Out</th>
              <th className="px-4 py-3">Shift 2 In</th>
              <th className="px-4 py-3">Shift 2 Out</th>
              <th className="px-4 py-3">Status</th>
              {isAdmin && <th className="px-4 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="px-4 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && records.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="px-4 py-6 text-center text-slate-500">
                  No attendance recorded for this date yet.
                </td>
              </tr>
            )}
            {records.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                  {r.staff?.fullName}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatTimeOfDay(r.shift1In)}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatTimeOfDay(r.shift1Out)}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatTimeOfDay(r.shift2In)}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatTimeOfDay(r.shift2Out)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>
                    {ATTENDANCE_STATUS_LABELS[r.status]}
                  </span>
                  {r.overrideNote && (
                    <span className="block text-xs text-slate-500 dark:text-slate-400">Overridden: {r.overrideNote}</span>
                  )}
                </td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setOverrideRecord(r)}
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                      title="Override"
                    >
                      ✏️
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {overrideRecord && (
        <AttendanceOverrideModal
          record={overrideRecord}
          onClose={() => setOverrideRecord(null)}
          onSaved={load}
        />
      )}
      {showMarkModal && (
        <AttendanceMarkModal date={date} onClose={() => setShowMarkModal(false)} onSaved={load} />
      )}
    </div>
  );
}
