import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { ATTENDANCE_STATUS_LABELS, QUERY_STATUS_LABELS } from "../../types";
import type { AttendanceStatus, QueryStatus, StaffProfile } from "../../types";
import { formatDate, formatDateTime, formatTimeOfDay } from "../../utils/date";

/** Admin/Auditor-only read-only "view this user's login" — a consolidated snapshot (attendance,
 * ledger, assigned queries, entry counts), not a re-skin of the whole app as that staff member.
 * No action is reachable from this page — it's strictly a support/oversight view. */
export function StaffProfileViewPage() {
  const { id } = useParams();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .get<StaffProfile>(`/staff/${id}/profile`)
      .then(({ data }) => setProfile(data))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="px-6 py-8 text-sm text-slate-500">Loading…</div>;
  if (error || !profile) {
    return (
      <div className="px-6 py-8">
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error ?? "Not found"}
        </p>
      </div>
    );
  }

  const { staff, attendance, ledger, assignedQueries, entries } = profile;
  const balanceLabel =
    ledger.balance === 0
      ? "Settled"
      : ledger.balance > 0
        ? `Owes office ₹${ledger.balance.toFixed(2)}`
        : `Office owes ₹${Math.abs(ledger.balance).toFixed(2)}`;

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{staff.fullName}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            View-only — {staff.role} · {staff.email} · {staff.mobile} ·{" "}
            {staff.isActive ? "Active" : "Inactive"} · Last login {staff.lastLoginAt ? formatDateTime(staff.lastLoginAt) : "Never"}
          </p>
        </div>
        <Link
          to="/users"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Back to Users
        </Link>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Attendance — This Month</h2>
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(ATTENDANCE_STATUS_LABELS) as AttendanceStatus[]).map((s) => (
              <div key={s} className="rounded-lg bg-slate-50 p-3 text-center dark:bg-slate-800">
                <div className="text-xl font-semibold text-slate-900 dark:text-slate-100">{attendance.monthSummary[s] ?? 0}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{ATTENDANCE_STATUS_LABELS[s]}</div>
              </div>
            ))}
          </div>
          <h3 className="mb-2 mt-4 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Recent Punches</h3>
          <div className="max-h-56 space-y-1 overflow-y-auto text-sm">
            {attendance.recent.length === 0 && <p className="text-slate-500">No attendance recorded yet.</p>}
            {attendance.recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between border-b border-slate-100 py-1.5 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-300">{formatDate(r.workDate)}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {formatTimeOfDay(r.shift1In)}–{formatTimeOfDay(r.shift1Out)}
                </span>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{ATTENDANCE_STATUS_LABELS[r.status]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Credit / Debit Ledger</h2>
          <p
            className={`mb-3 text-lg font-semibold ${
              ledger.balance === 0
                ? "text-slate-500 dark:text-slate-400"
                : ledger.balance > 0
                  ? "text-red-700 dark:text-red-400"
                  : "text-emerald-700 dark:text-emerald-400"
            }`}
          >
            {balanceLabel}
          </p>
          <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Recent Entries</h3>
          <div className="max-h-56 space-y-1 overflow-y-auto text-sm">
            {ledger.recentEntries.length === 0 && <p className="text-slate-500">No ledger entries yet.</p>}
            {ledger.recentEntries.map((e) => (
              <div key={e.id} className="flex items-center justify-between border-b border-slate-100 py-1.5 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-300">{formatDate(e.entryDate)}</span>
                <span className={`text-xs font-medium ${e.type === "DEBIT" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {e.type === "DEBIT" ? "Debit" : "Credit"} ₹{e.amount}
                </span>
                <span className="max-w-[40%] truncate text-xs text-slate-500 dark:text-slate-400" title={e.note}>
                  {e.note}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Assigned Client Queries</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(QUERY_STATUS_LABELS) as QueryStatus[]).map((s) => (
              <div key={s} className="rounded-lg bg-slate-50 p-3 text-center dark:bg-slate-800">
                <div className="text-xl font-semibold text-slate-900 dark:text-slate-100">{assignedQueries[s] ?? 0}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{QUERY_STATUS_LABELS[s]}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Data Entry Volume (all time)</h2>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-slate-50 p-3 text-center dark:bg-slate-800">
              <div className="text-xl font-semibold text-slate-900 dark:text-slate-100">{entries.pan}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">PAN Applications Entered</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-center dark:bg-slate-800">
              <div className="text-xl font-semibold text-slate-900 dark:text-slate-100">{entries.tan}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">TAN Applications Entered</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
