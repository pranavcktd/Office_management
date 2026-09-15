import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { BulkImportModal } from "../../components/BulkImportModal";
import { Pagination } from "../../components/Pagination";
import type { Agent, PaginatedResponse } from "../../types";
import { formatDateTime } from "../../utils/date";
import { AgentBulkActionsModal } from "./AgentBulkActionsModal";
import { AgentLedgerModal } from "./AgentLedgerModal";
import { ResetAgentPasswordModal } from "./ResetAgentPasswordModal";

export function AgentListPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const isAuditor = user?.role === "AUDITOR";
  const [searchParams] = useSearchParams();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [statusFilter, setStatusFilter] = useState<"" | "ACTIVE" | "INACTIVE">(
    (searchParams.get("status") as "ACTIVE" | "INACTIVE") || ""
  );

  useEffect(() => {
    const s = searchParams.get("status") as "ACTIVE" | "INACTIVE" | null;
    setStatusFilter(s ?? "");
  }, [searchParams]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ledgerAgent, setLedgerAgent] = useState<Agent | null>(null);
  const [resetPasswordAgent, setResetPasswordAgent] = useState<Agent | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkAction, setBulkAction] = useState<"email" | "notify" | "reset-password" | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<PaginatedResponse<Agent>>("/agents", {
        params: { status: statusFilter || undefined, q: search || undefined, page, pageSize },
      });
      setAgents(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search]);

  useEffect(() => {
    const timer = setTimeout(load, 250); // debounce keyword search
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search, page, pageSize]);

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === agents.length ? new Set() : new Set(agents.map((a) => a.id))));
  }

  const selectedAgents = agents.filter((a) => selectedIds.has(a.id));

  async function onDeactivate(id: number) {
    if (!window.confirm("Deactivate this agent? They will no longer be selectable for new forms.")) return;
    try {
      await api.patch(`/agents/${id}`, { isActive: false });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function onReactivate(id: number) {
    try {
      await api.patch(`/agents/${id}`, { isActive: true });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Agents</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {total} record{total === 1 ? "" : "s"}
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Import Excel
            </button>
            <Link
              to="/agents/new"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              + New Agent
            </Link>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, firm, mobile…"
          className="w-64 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600 dark:text-slate-400">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | "ACTIVE" | "INACTIVE")}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      {isAdmin && selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 dark:border-indigo-800 dark:bg-indigo-950">
          <span className="text-sm font-medium text-indigo-800 dark:text-indigo-200">
            {selectedIds.size} selected
          </span>
          <button
            onClick={() => setBulkAction("email")}
            className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-slate-800"
          >
            ✉️ Send Email
          </button>
          <button
            onClick={() => setBulkAction("notify")}
            className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-slate-800"
          >
            🔔 Notify
          </button>
          <button
            onClick={() => setBulkAction("reset-password")}
            className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-slate-800"
          >
            🔑 Reset Passwords
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-sm text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Clear selection
          </button>
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              {isAdmin && (
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={agents.length > 0 && selectedIds.size === agents.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </th>
              )}
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Firm</th>
              <th className="px-4 py-3">Mobile</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last Login</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="px-4 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && agents.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="px-4 py-6 text-center text-slate-500">
                  No agents found.
                </td>
              </tr>
            )}
            {agents.map((agent) => (
              <tr key={agent.id}>
                {isAdmin && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(agent.id)}
                      onChange={() => toggleSelected(agent.id)}
                      aria-label={`Select ${agent.agentName}`}
                    />
                  </td>
                )}
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                  {agent.agentName}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{agent.firmName ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{agent.mobile}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{agent.email ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      agent.isActive
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    {agent.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                  {agent.lastLoginAt ? formatDateTime(agent.lastLoginAt) : "Never"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setLedgerAgent(agent)}
                      title="View Ledger"
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      📊
                    </button>
                    {(isAdmin || isAuditor) && (
                      <Link
                        to={`/agents/${agent.id}/portal`}
                        title="View Agent Portal (read-only)"
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                      >
                        👁️
                      </Link>
                    )}
                    {isAdmin && (
                      <>
                        <Link
                          to={`/agents/${agent.id}/edit`}
                          title="Edit"
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          ✏️
                        </Link>
                        <button
                          onClick={() => setResetPasswordAgent(agent)}
                          title="Reset Password"
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          🔑
                        </button>
                        {agent.isActive ? (
                          <button
                            onClick={() => onDeactivate(agent.id)}
                            title="Deactivate"
                            className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                          >
                            🚫
                          </button>
                        ) : (
                          <button
                            onClick={() => onReactivate(agent.id)}
                            title="Reactivate"
                            className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                          >
                            ✅
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

      {ledgerAgent && <AgentLedgerModal agent={ledgerAgent} onClose={() => setLedgerAgent(null)} />}
      {resetPasswordAgent && (
        <ResetAgentPasswordModal
          agent={resetPasswordAgent}
          onClose={() => setResetPasswordAgent(null)}
          onDone={load}
        />
      )}
      {showImportModal && (
        <BulkImportModal
          title="Import Agents"
          description="Upload an .xlsx/.xls/.csv file to create many agents at once. A row is only skipped if the Agent Name is blank — a missing or duplicate email is dropped (noted in the result) but the rest of the row is still imported."
          importPath="/agents/import"
          templatePath="/agents/import-template"
          templateFilename="agents-import-template.xlsx"
          onClose={() => setShowImportModal(false)}
          onImported={load}
        />
      )}
      {bulkAction && (
        <AgentBulkActionsModal
          action={bulkAction}
          agentIds={[...selectedIds]}
          agentNames={selectedAgents.map((a) => a.agentName)}
          onClose={() => setBulkAction(null)}
          onDone={() => {
            setSelectedIds(new Set());
            load();
          }}
        />
      )}
    </div>
  );
}
