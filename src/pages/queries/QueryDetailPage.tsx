import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { DetailRow } from "../../components/DetailRow";
import { QUERY_STATUS_LABELS } from "../../types";
import type { ClientQuery, QueryStatus, Staff } from "../../types";
import { formatDateTime } from "../../utils/date";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";
const labelClass = "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";

export function QueryDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "ADMIN";
  const isAuditor = user?.role === "AUDITOR";

  const [query, setQuery] = useState<ClientQuery | null>(null);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [assignedTo, setAssignedTo] = useState("");
  const [status, setStatus] = useState<QueryStatus>("OPEN");
  const [responseText, setResponseText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    try {
      const { data } = await api.get<ClientQuery>(`/queries/${id}`);
      setQuery(data);
      setAssignedTo(data.assignedToId ? String(data.assignedToId) : "");
      setStatus(data.status);
      setResponseText(data.responseText ?? "");
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
    api.get<Staff[]>("/staff").then(({ data }) => setStaffList(data)).catch(() => setStaffList([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onAssign() {
    if (!assignedTo) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/queries/${id}/assign`, { assignedToId: Number(assignedTo) });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function onUpdate() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/queries/${id}`, { status, responseText: responseText || undefined });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!window.confirm("Delete this query? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await api.delete(`/queries/${id}`);
      navigate("/queries");
    } catch (err) {
      setError(extractErrorMessage(err));
      setDeleting(false);
    }
  }

  if (!query) {
    return (
      <div className="px-6 py-8">
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>
        ) : (
          <p className="text-sm text-slate-500">Loading…</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Query #{query.id}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{query.clientName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/queries"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Back to list
          </Link>
          <Link
            to={`/queries/${query.id}/edit`}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Edit
          </Link>
          {isAdmin && (
            <button
              onClick={onDelete}
              disabled={deleting}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      </div>

      <dl className="rounded-xl border border-slate-200 bg-white px-5 dark:border-slate-800 dark:bg-slate-900">
        <DetailRow label="Client Name" value={query.clientName} />
        <DetailRow label="Mobile" value={query.mobile} />
        <DetailRow label="Email" value={query.email} />
        <DetailRow
          label="Service"
          value={query.serviceCategory?.name ?? "—"}
        />
        {query.panNumber && <DetailRow label="PAN Number" value={query.panNumber} />}
        {query.aadhaarNumber && <DetailRow label="Aadhaar Number" value={query.aadhaarNumber} />}
        {query.taxYear && <DetailRow label="Tax Year" value={query.taxYear} />}
        <DetailRow label="Query" value={query.queryText} />
        <DetailRow label="Created" value={formatDateTime(query.createdAt)} />
      </dl>

      {!isAuditor && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Assignment</h2>
          <div className="flex flex-wrap gap-2">
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={inputClass}>
              <option value="">Unassigned</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </select>
            <button
              onClick={onAssign}
              disabled={saving || !assignedTo}
              className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              Assign
            </button>
          </div>
        </div>
      )}

      {!isAuditor && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Status & Response</h2>
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as QueryStatus)} className={inputClass}>
                {(Object.keys(QUERY_STATUS_LABELS) as QueryStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {QUERY_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Client-facing response</label>
              <textarea
                className={inputClass}
                rows={3}
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
              />
            </div>
            <button
              onClick={onUpdate}
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {query.auditTrail && query.auditTrail.length > 0 && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Audit Trail</h2>
          <ul className="space-y-2 text-sm">
            {query.auditTrail.map((entry) => (
              <li key={entry.id} className="border-b border-slate-100 pb-2 last:border-0 dark:border-slate-800">
                <span className="font-medium text-slate-700 dark:text-slate-300">{entry.action}</span>{" "}
                <span className="text-slate-500 dark:text-slate-400">
                  by {entry.actorName ?? "system"} — {formatDateTime(entry.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
