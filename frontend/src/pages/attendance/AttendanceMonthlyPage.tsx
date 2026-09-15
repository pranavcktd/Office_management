import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { ExportButtons } from "../../components/ExportButtons";
import { ATTENDANCE_STATUS_LABELS } from "../../types";
import type { AttendanceStatus, MonthlyAttendanceReport, Staff } from "../../types";
import { formatDate, formatTimeOfDay, formatWorkedMinutes, totalWorkedMinutes } from "../../utils/date";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_BADGE: Record<AttendanceStatus, string> = {
  PRESENT: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  HALF_DAY: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  ABSENT: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300",
  OVERTIME: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
};

export function AttendanceMonthlyPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const now = new Date();

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffId, setStaffId] = useState<string>(user ? String(user.id) : "");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [report, setReport] = useState<MonthlyAttendanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get<Staff[]>("/staff")
      .then(({ data }) => setStaffList(data))
      .catch(() => setStaffList([]));
  }, [isAdmin]);

  async function load() {
    if (!staffId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<MonthlyAttendanceReport>("/attendance/monthly", {
        params: { staffId, month, year },
      });
      setReport(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId, month, year]);

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Monthly Attendance
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Calendar summary and total hours logged
          </p>
        </div>
        <Link
          to="/attendance"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Back to Daily View
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        {isAdmin && (
          <select
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </select>
        )}
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          {MONTH_NAMES.map((name, idx) => (
            <option key={name} value={idx + 1} disabled={year === now.getFullYear() && idx + 1 > now.getMonth() + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => {
            const y = Number(e.target.value);
            setYear(y);
            if (y === now.getFullYear() && month > now.getMonth() + 1) setMonth(now.getMonth() + 1);
          }}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          {Array.from({ length: 4 }, (_, i) => now.getFullYear() - 3 + i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <div className="ml-auto">
          <ExportButtons
            exportPath="/attendance/monthly/export"
            params={{ staffId: staffId || undefined, month: String(month), year: String(year) }}
          />
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {!loading && report && (
        <>
          <div className="mb-6 grid grid-cols-5 gap-3 text-center">
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <div className="text-xl font-semibold text-slate-900 dark:text-slate-100">{report.totalHours}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Total Hours</div>
            </div>
            {(Object.keys(ATTENDANCE_STATUS_LABELS) as AttendanceStatus[]).map((s) => (
              <div key={s} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {report.summary[s]}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{ATTENDANCE_STATUS_LABELS[s]}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Shift 1 In</th>
                  <th className="px-4 py-3">Shift 1 Out</th>
                  <th className="px-4 py-3">Shift 2 In</th>
                  <th className="px-4 py-3">Shift 2 Out</th>
                  <th className="px-4 py-3">Worked Hours</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {report.records.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                      No attendance recorded for this month.
                    </td>
                  </tr>
                )}
                {report.records.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(r.workDate)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatTimeOfDay(r.shift1In)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatTimeOfDay(r.shift1Out)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatTimeOfDay(r.shift2In)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatTimeOfDay(r.shift2Out)}</td>
                    <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{formatWorkedMinutes(totalWorkedMinutes(r))}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>
                        {ATTENDANCE_STATUS_LABELS[r.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
