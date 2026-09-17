import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { DetailRow } from "../../components/DetailRow";
import { TrackingButton } from "../../components/TrackingButton";
import { COURIER_AGENCY_LABELS } from "../../types";
import type { DispatchEntry } from "../../types";
import { formatDateTime } from "../../utils/date";

export function DispatchDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "ADMIN";

  const [entry, setEntry] = useState<DispatchEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api
      .get<DispatchEntry>(`/dispatch/${id}`)
      .then(({ data }) => setEntry(data))
      .catch((err) => setError(extractErrorMessage(err)));
  }, [id]);

  async function onDelete() {
    if (!window.confirm("Delete this register entry? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await api.delete(`/dispatch/${id}`);
      navigate("/dispatch");
    } catch (err) {
      setError(extractErrorMessage(err));
      setDeleting(false);
    }
  }

  async function viewReceipt() {
    try {
      const res = await api.get(`/dispatch/${id}/receipt`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  if (error) {
    return (
      <div className="px-6 py-8">
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      </div>
    );
  }
  if (!entry) {
    return <div className="px-6 py-8 text-sm text-slate-500">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Register Entry #{entry.id}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {entry.entryType === "INWARD" ? "Inward" : "Outward"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TrackingButton module="DISPATCH" label="Track" />
          <Link
            to="/dispatch"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Back to list
          </Link>
          {isAdmin && (
            <>
              <Link
                to={`/dispatch/${entry.id}/edit`}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Edit
              </Link>
              <button
                onClick={onDelete}
                disabled={deleting}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </>
          )}
        </div>
      </div>

      <dl className="rounded-xl border border-slate-200 bg-white px-5 dark:border-slate-800 dark:bg-slate-900">
        <DetailRow label="Entry Type" value={entry.entryType === "INWARD" ? "Inward (Received)" : "Outward (Dispatched)"} />
        <DetailRow label="Item Type" value={entry.itemCategory?.name ?? "—"} />
        <DetailRow
          label="Courier Agency"
          value={
            entry.courierAgency
              ? entry.courierAgency === "OTHER" && entry.courierOtherDetail
                ? `Other (${entry.courierOtherDetail})`
                : COURIER_AGENCY_LABELS[entry.courierAgency]
              : null
          }
        />
        <DetailRow label="Consignment Number" value={entry.consignmentNumber} />
        <DetailRow
          label={entry.entryType === "INWARD" ? "Sender" : "Receiver"}
          value={entry.partyDetails}
        />
        <DetailRow label="Mobile Number" value={entry.mobile} />
        <DetailRow label="Details of Courier" value={entry.courierDetails} />
        <DetailRow
          label="Receipt"
          value={
            entry.receiptPath ? (
              <button type="button" onClick={viewReceipt} className="text-indigo-600 hover:underline dark:text-indigo-400">
                View / download
              </button>
            ) : (
              "None"
            )
          }
        />
        <DetailRow label="Handled By" value={entry.handledBy.fullName} />
        <DetailRow label="Date & Time" value={formatDateTime(entry.createdAt)} />
      </dl>
    </div>
  );
}
