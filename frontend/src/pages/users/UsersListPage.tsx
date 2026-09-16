import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Pagination } from "../../components/Pagination";
import { MODULE_LABELS } from "../../types";
import type { PaginatedResponse, Staff } from "../../types";
import { formatDateTime } from "../../utils/date";
import { ResetStaffPasswordModal } from "./ResetStaffPasswordModal";

export function UsersListPage() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "ADMIN";
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<Staff | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<PaginatedResponse<Staff>>("/staff", { params: { page, pageSize } });
      setStaff(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  async function onToggleActive(s: Staff) {
    if (s.isActive && !window.confirm(`Deactivate ${s.fullName}? They will no longer be able to sign in.`)) return;
    try {
      await api.patch(`/staff/${s.id}`, { isActive: !s.isActive });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Users</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {total} user{total === 1 ? "" : "s"}
          </p>
        </div>
        {isAdmin && (
          <Link
            to="/users/new"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            + New User
          </Link>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Mobile</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Modules</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last Login</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && staff.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  No users found.
                </td>
              </tr>
            )}
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{s.fullName}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{s.mobile}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{s.email ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      s.role === "ADMIN"
                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                        : s.role === "AUDITOR"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    {s.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                  {s.role === "ADMIN"
                    ? "All"
                    : s.role === "AUDITOR"
                      ? "All (view-only)"
                      : s.modules && s.modules.length > 0
                        ? s.modules.map((m) => MODULE_LABELS[m]).join(", ")
                        : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      s.isActive
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    {s.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                  {s.lastLoginAt ? formatDateTime(s.lastLoginAt) : "Never"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Link
                      to={`/users/${s.id}/profile`}
                      title="View (read-only)"
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      👁
                    </Link>
                    {isAdmin && (
                      <>
                        <Link
                          to={`/users/${s.id}/edit`}
                          title="Edit"
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          ✏️
                        </Link>
                        <button
                          onClick={() => setResetTarget(s)}
                          title="Reset Password"
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          🔑
                        </button>
                        {s.id !== currentUser?.id && (
                          <button
                            onClick={() => onToggleActive(s)}
                            title={s.isActive ? "Deactivate" : "Activate"}
                            className={`rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 ${
                              s.isActive ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            {s.isActive ? "🚫" : "✅"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />

      {resetTarget && (
        <ResetStaffPasswordModal staff={resetTarget} onClose={() => setResetTarget(null)} onDone={load} />
      )}
    </div>
  );
}
