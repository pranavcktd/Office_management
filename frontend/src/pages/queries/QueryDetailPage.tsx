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

const AUDIT_TITLES: Record<string, string> = {
  QUERY_ASSIGNED: "Assigned",
  QUERY_EDITED: "Query details edited",
  QUERY_UPDATED: "Status changed",
  QUERY_DELETED: "Deleted",
};

interface TimelineEntry {
  key: string;
  at: string;
  kind: "created" | "event" | "message";
  title: string;
  detail?: string | null;
  actor?: string | null;
}

/** Merges the query's own creation time, the generic audit trail (assignment/edit/status-only
 * changes), and the client-facing update thread into one chronological "ticket" feed — the
 * created-to-closed track a support-ticket view would show, rather than three separate lists. */
function buildTimeline(query: ClientQuery): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { key: "created", at: query.createdAt, kind: "created", title: "Query created", actor: null },
  ];
  for (const a of query.auditTrail ?? []) {
    // QUERY_CREATED is already represented above; QUERY_UPDATE_ADDED is represented by its own
    // richer entry below (with the actual message), so skip both here to avoid duplicates.
    if (a.action === "QUERY_CREATED" || a.action === "QUERY_UPDATE_ADDED") continue;
    entries.push({ key: `audit-${a.id}`, at: a.createdAt, kind: "event", title: AUDIT_TITLES[a.action] ?? a.action, actor: a.actorName });
  }
  for (const u of query.updates ?? []) {
    entries.push({
      key: `update-${u.id}`,
      at: u.createdAt,
      kind: "message",
      title: u.statusAtUpdate ? `Update — status set to ${QUERY_STATUS_LABELS[u.statusAtUpdate]}` : "Update",
      detail: u.message,
      actor: u.createdBy?.fullName,
    });
  }
  return entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export function QueryDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "ADMIN";
  const isAuditor = user?.role === "AUDITOR";

  const [query, setQuery] = useState<ClientQuery | null>(null);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [assignedTo, setAssignedTo] = useState("");
  const [updateStatus, setUpdateStatus] = useState<QueryStatus>("OPEN");
  const [updateMessage, setUpdateMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Once a query is assigned, reassigning it, editing it, and closing it are all reserved for
  // that one staff member (or an admin) — see queries.controller.ts's assertOwnsQuery. Anyone
  // else can still see it and post updates/status changes short of closing.
  const canManage = isAdmin || !query?.assignedToId || query?.assignedToId === user?.id;

  async function load() {
    try {
      const { data } = await api.get<ClientQuery>(`/queries/${id}`);
      setQuery(data);
      setAssignedTo(data.assignedToId ? String(data.assignedToId) : "");
      setUpdateStatus(data.status);
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

  async function onPostUpdate() {
    if (!updateMessage.trim() || !query) return;
    setPosting(true);
    setError(null);
    try {
      await api.post(`/queries/${id}/updates`, {
        message: updateMessage.trim(),
        status: updateStatus !== query.status ? updateStatus : undefined,
      });
      setUpdateMessage("");
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setPosting(false);
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

  const timeline = buildTimeline(query);

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
          {canManage && (
            <Link
              to={`/queries/${query.id}/edit`}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Edit
            </Link>
          )}
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
        <DetailRow label="Status" value={QUERY_STATUS_LABELS[query.status]} />
        <DetailRow label="Created" value={formatDateTime(query.createdAt)} />
      </dl>

      {!isAuditor && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Assignment</h2>
          {canManage ? (
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
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Assigned to <span className="font-medium text-slate-700 dark:text-slate-300">{query.assignedTo?.fullName}</span> — only they (or an admin) can reassign it.
            </p>
          )}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Ticket Timeline</h2>
        <ol className="space-y-4">
          {timeline.map((entry) => (
            <li key={entry.key} className="relative border-l-2 border-slate-200 pl-4 dark:border-slate-700">
              <div className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500" />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{entry.title}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">{formatDateTime(entry.at)}</span>
                {entry.actor && <span className="text-xs text-slate-400 dark:text-slate-500">· {entry.actor}</span>}
              </div>
              {entry.detail && (
                <p className="mt-1 whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {entry.detail}
                </p>
              )}
            </li>
          ))}
        </ol>
      </div>

      {!isAuditor && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Post an Update</h2>
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Status</label>
              <select value={updateStatus} onChange={(e) => setUpdateStatus(e.target.value as QueryStatus)} className={inputClass}>
                {(Object.keys(QUERY_STATUS_LABELS) as QueryStatus[])
                  .filter((s) => s !== "CLOSED" || canManage || query.status === "CLOSED")
                  .map((s) => (
                    <option key={s} value={s}>
                      {QUERY_STATUS_LABELS[s]}
                    </option>
                  ))}
              </select>
              {!canManage && (
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  Only {query.assignedTo?.fullName ?? "the assignee"} (or an admin) can close this query.
                </p>
              )}
            </div>
            <div>
              <label className={labelClass}>Client-facing update</label>
              <textarea
                className={inputClass}
                rows={3}
                placeholder="What was communicated to the client, or the latest progress on this query…"
                value={updateMessage}
                onChange={(e) => setUpdateMessage(e.target.value.toUpperCase())}
              />
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Every update is added to the timeline above with the date/time and your name — nothing is overwritten.
              </p>
            </div>
            <button
              onClick={onPostUpdate}
              disabled={posting || !updateMessage.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {posting ? "Posting…" : "Post Update"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
