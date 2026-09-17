import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { DateInput } from "../../components/DateInput";
import { TrackingButton } from "../../components/TrackingButton";
import { REJECTION_LABELS, RESIDENCY_STATUS_LABELS, STATUS_LABELS } from "../../types";
import type { PanApplication } from "../../types";
import { formatDate, formatDateTime, isoToDdMmYyyy } from "../../utils/date";
import { getPanFormNumber } from "../../utils/formNumbers";

function Section({ title, borderColor, children, full }: { title: string; borderColor: string; children: ReactNode; full?: boolean }) {
  return (
    <div
      className={`rounded-xl border border-slate-200 border-l-4 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 ${borderColor} ${full ? "sm:col-span-2 xl:col-span-3" : ""}`}
    >
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h2>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">{children}</div>
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : undefined}>
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">{value ?? "—"}</dd>
    </div>
  );
}

/** Lets staff enter an ack number for a form still awaiting one, or correct a wrong one already
 * on file — the same PATCH /pan/:id/ack endpoint the list page's quick-entry uses. */
function AckEditor({ app, onSaved }: { app: PanApplication; onSaved: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const isAuditor = user?.role === "AUDITOR";
  const [editing, setEditing] = useState(false);
  const [ackNumber, setAckNumber] = useState(app.ackNumber ?? "");
  const [punchingDate, setPunchingDate] = useState(app.punchingDate ? isoToDdMmYyyy(app.punchingDate) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setAckNumber(app.ackNumber ?? "");
    setPunchingDate(app.punchingDate ? isoToDdMmYyyy(app.punchingDate) : "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (!ackNumber) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/pan/${app.id}/ack`, { ackNumber, punchingDate: punchingDate || undefined });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    if (isAuditor) return null;
    if (app.ackNumber && !isAdmin) return null;
    return (
      <button onClick={open} className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
        {app.ackNumber ? "Correct" : "+ Enter Ack Number"}
      </button>
    );
  }

  return (
    <div className="col-span-2 flex flex-wrap items-center gap-1.5 pt-1">
      <input
        value={ackNumber}
        onChange={(e) => setAckNumber(e.target.value)}
        placeholder="Ack number"
        className="w-32 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
      />
      <DateInput
        value={punchingDate}
        onChange={setPunchingDate}
        className="w-28 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
      />
      <button
        onClick={save}
        disabled={!ackNumber || saving}
        className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
      >
        {saving ? "…" : "Save"}
      </button>
      <button
        onClick={() => setEditing(false)}
        className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Cancel
      </button>
      {error && <p className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export function PanDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "ADMIN";

  const [app, setApp] = useState<PanApplication | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function reload() {
    api
      .get<PanApplication>(`/pan/${id}`)
      .then(({ data }) => setApp(data))
      .catch((err) => setError(extractErrorMessage(err)));
  }

  useEffect(reload, [id]);

  async function onDelete() {
    if (!window.confirm("Delete this PAN application? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await api.delete(`/pan/${id}`);
      navigate("/pan");
    } catch (err) {
      setError(extractErrorMessage(err));
      setDeleting(false);
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
  if (!app) {
    return <div className="px-6 py-8 text-sm text-slate-500">Loading…</div>;
  }

  const hasRejectionOrAdjustment =
    app.status === "REJECTED" || (app.paymentMode === "ADJUSTED" && app.adjustedFrom);

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            PAN Application #{app.id}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{app.applicantName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TrackingButton module="PAN" />
          <Link
            to="/pan"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Back to list
          </Link>
          {isAdmin && (
            <>
              <Link
                to={`/pan/${app.id}/edit`}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Section title="Applicant Details" borderColor="border-l-indigo-500">
          <Field label="Application Type" value={app.applicationType === "NEW" ? "New" : "Correction / CSF"} />
          <Field label="Form Number" value={getPanFormNumber(app.applicationType, app.residencyStatus, app.applicantStatus)} />
          <Field label="Category" value={app.applicantStatus === "INDIVIDUAL" ? "Individual" : "Non-Individual"} />
          <Field label="Residency Status" value={RESIDENCY_STATUS_LABELS[app.residencyStatus]} />
          {app.existingPan && <Field label="PAN Number" value={app.existingPan} />}
          <Field label="Applicant Name" value={app.applicantName} full />
          {app.fatherName && <Field label="Father's Name" value={app.fatherName} />}
          <Field label="Date of Birth" value={formatDate(app.dob)} />
          <Field label="Mobile" value={app.mobile} />
          <Field label="Email" value={app.email} />
          <Field label="Aadhaar" value={app.aadhaarNumber} />
          {app.guardianAadhaarNumber && (
            <Field label="Guardian (RA) Aadhaar" value={app.guardianAadhaarNumber} />
          )}
          <Field label="Signed Status" value={app.signedStatus === "SIGNATURE" ? "Physical Signature" : "Thumb Impression"} />
        </Section>

        <Section title="Entry & Source" borderColor="border-l-blue-500">
          <Field label="Form Source" value={app.sourceType === "AGENT" ? app.agent?.agentName ?? "Agent" : "Office Walk-in"} full />
          <Field label="Form Received Date" value={formatDate(app.formReceivedDate)} />
          <Field label="Entry Date & Time" value={formatDateTime(app.createdAt)} />
          <Field label="Entered By" value={app.createdBy?.fullName} full />
          {app.notes && <Field label="Notes" value={app.notes} full />}
        </Section>

        <Section title="Fee & Payment" borderColor="border-l-amber-500">
          <Field label="Fees Paid" value={`₹${app.feeAmount}`} />
          <Field
            label="Standard Fee"
            value={
              app.standardFeeAmount ? (
                <>
                  ₹{app.standardFeeAmount}
                  {Number(app.standardFeeAmount) !== Number(app.feeAmount) && (
                    <span className={Number(app.standardFeeAmount) > Number(app.feeAmount) ? "ml-1 text-red-600 dark:text-red-400" : "ml-1 text-blue-600 dark:text-blue-400"}>
                      ({Number(app.standardFeeAmount) > Number(app.feeAmount) ? "short by" : "over by"} ₹
                      {Math.abs(Number(app.standardFeeAmount) - Number(app.feeAmount)).toFixed(2)})
                    </span>
                  )}
                </>
              ) : undefined
            }
          />
          <Field
            label="Payment Mode"
            value={
              app.paymentMode === "OTHER" && app.paymentOtherDetail
                ? `Other (${app.paymentOtherDetail})`
                : app.paymentMode === "ONLINE" && app.onlinePaymentDetail
                  ? `Online (${app.onlinePaymentDetail})`
                  : app.paymentMode === "CASH" && app.cashReceivedBy
                    ? `Cash (received by ${app.cashReceivedBy.fullName})`
                    : app.paymentMode
            }
            full
          />
        </Section>

        <Section title="Acknowledgement" borderColor="border-l-emerald-500">
          <Field label="Acknowledgement Number" value={app.ackNumber ?? "Not yet available"} full />
          <Field label="Punching Date at Protean" value={app.punchingDate ? formatDate(app.punchingDate) : undefined} full />
          <div className="col-span-2">
            <AckEditor app={app} onSaved={reload} />
          </div>
        </Section>

        <Section title={hasRejectionOrAdjustment ? "Rejection & Adjustment" : "Status"} borderColor="border-l-red-500">
          <Field
            label="Form Status"
            value={
              <>
                {STATUS_LABELS[app.status]}
                {app.status === "REJECTED" && app.rejectionReason && ` · ${REJECTION_LABELS[app.rejectionReason]}`}
                {app.status === "REJECTED" && app.rejectionReason === "OTHER" && app.rejectionOtherDetail
                  ? ` (${app.rejectionOtherDetail})`
                  : ""}
              </>
            }
            full
          />
          {app.status === "REJECTED" && app.rejectionDate && (
            <Field label="Rejection Date" value={formatDate(app.rejectionDate)} />
          )}
          {app.paymentMode === "ADJUSTED" && app.adjustedFrom && (
            <Field
              label="Adjusted From"
              full
              value={
                <>
                  <Link to={`/pan/${app.adjustedFrom.id}`} className="text-indigo-600 hover:underline dark:text-indigo-400">
                    #{app.adjustedFrom.id} — {app.adjustedFrom.applicantName}
                  </Link>
                  {app.adjustedFrom.rejectionReason && (
                    <span className="ml-1 text-slate-500 dark:text-slate-400">
                      (rejected — {REJECTION_LABELS[app.adjustedFrom.rejectionReason]}
                      {app.adjustedFrom.rejectionDate ? ` on ${formatDate(app.adjustedFrom.rejectionDate)}` : ""})
                    </span>
                  )}
                </>
              }
            />
          )}
          {app.status === "REJECTED" && (
            <Field
              label="Adjustment Credit"
              full
              value={
                app.adjustmentAvailable ? (
                  <span className="text-emerald-600 dark:text-emerald-400">Available</span>
                ) : app.adjustmentExpiredAt ? (
                  <span className="text-slate-500 dark:text-slate-400">Cleared (on {formatDate(app.adjustmentExpiredAt)})</span>
                ) : app.adjustedTo ? (
                  <span className="text-slate-500 dark:text-slate-400">
                    Used by{" "}
                    <Link to={`/pan/${app.adjustedTo.id}`} className="text-indigo-600 hover:underline dark:text-indigo-400">
                      #{app.adjustedTo.id} — {app.adjustedTo.applicantName}
                    </Link>{" "}
                    (on {formatDate(app.adjustedTo.createdAt)})
                  </span>
                ) : (
                  <span className="text-slate-500 dark:text-slate-400">Used</span>
                )
              }
            />
          )}
        </Section>
      </div>
    </div>
  );
}
