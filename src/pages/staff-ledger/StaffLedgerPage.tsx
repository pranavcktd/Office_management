import { useEffect, useState } from "react";
import { api, extractErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Pagination } from "../../components/Pagination";
import { formatDate } from "../../utils/date";
import type { PaginatedResponse, StaffLedgerEntry, StaffLedgerSummaryRow } from "../../types";
import { StaffLedgerEntryModal } from "./StaffLedgerEntryModal";

function formatBalance(balance: number): { label: string; className: string } {
  if (balance === 0) {
    return { label: "Settled", className: "text-slate-500 dark:text-slate-400" };
  }
  if (balance > 0) {
    return {
      label: `Owes office ₹${balance.toFixed(2)}`,
      className: "text-red-700 dark:text-red-400",
    };
  }
  return {
    label: `Office owes ₹${Math.abs(balance).toFixed(2)}`,
    className: "text-emerald-700 dark:text-emerald-400",
  };
}

export function StaffLedgerPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const isPrivileged = isAdmin || user?.role === "AUDITOR";

  const [summary, setSummary] = useState<StaffLedgerSummaryRow[]>([]);
  const [staffId, setStaffId] = useState<number | "">("");
  const [entries, setEntries] = useState<StaffLedgerEntry[]>([]);
  const [balance, setBalance] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalEntry, setModalEntry] = useState<StaffLedgerEntry | "new" | null>(null);

  useEffect(() => {
    api
      .get<StaffLedgerSummaryRow[]>("/staff-ledger/summary")
      .then(({ data }) => {
        setSummary(data);
        // A plain staff member only ever has their own row; an admin/auditor starts on the
        // first staff member alphabetically rather than forcing an extra click.
        if (data.length > 0 && staffId === "") setStaffId(data[0].staffId);
      })
      .catch((err) => setError(extractErrorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    if (staffId === "") return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<PaginatedResponse<StaffLedgerEntry> & { balance: number }>("/staff-ledger", {
        params: { staffId, page, pageSize },
      });
      setEntries(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setBalance(data.balance);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId, page, pageSize]);

  async function onDelete(id: number) {
    if (!window.confirm("Delete this ledger entry? This cannot be undone.")) return;
    try {
      await api.delete(`/staff-ledger/${id}`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const balanceInfo = formatBalance(balance);

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Staff Credit / Debit Ledger</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {isPrivileged
              ? "Track cash advances taken by staff and their repayments."
              : "Your own credit/debit history with the office — view only."}
          </p>
        </div>
        {isAdmin && staffId !== "" && (
          <button
            onClick={() => setModalEntry("new")}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            + Add Entry
          </button>
        )}
      </div>

      {isPrivileged && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select
            value={staffId}
            onChange={(e) => {
              setStaffId(Number(e.target.value));
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            {summary.map((s) => (
              <option key={s.staffId} value={s.staffId}>
                {s.staffName}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {staffId !== "" && (
        <p className={`mb-4 text-lg font-semibold ${balanceInfo.className}`}>{balanceInfo.label}</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Note</th>
              <th className="px-4 py-3">Recorded By</th>
              {isAdmin && <th className="px-4 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-4 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-4 py-6 text-center text-slate-500">
                  No entries recorded yet.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(e.entryDate)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      e.type === "DEBIT"
                        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    }`}
                  >
                    {e.type === "DEBIT" ? "Debit" : "Credit"}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">₹{e.amount}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{e.note}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{e.createdBy?.fullName ?? "—"}</td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setModalEntry(e)}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        title="Edit"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => onDelete(e.id)}
                        className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                )}
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

      {modalEntry && staffId !== "" && (
        <StaffLedgerEntryModal
          staffId={staffId}
          entry={modalEntry === "new" ? null : modalEntry}
          onClose={() => setModalEntry(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
