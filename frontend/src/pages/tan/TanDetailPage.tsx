import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { APPLICANT_CATEGORY_LABELS, REJECTION_LABELS, STATUS_LABELS } from "../../types";
import type { TanApplication } from "../../types";
import { formatDate, formatDateTime } from "../../utils/date";
import { getTanFormNumber } from "../../utils/formNumbers";

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

export function TanDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "ADMIN";

  const [app, setApp] = useState<TanApplication | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api
      .get<TanApplication>(`/tan/${id}`)
      .then(({ data }) => setApp(data))
      .catch((err) => setError(extractErrorMessage(err)));
  }, [id]);

  async function onDelete() {
    if (!window.confirm("Delete this TAN application? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await api.delete(`/tan/${id}`);
      navigate("/tan");
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
            TAN Application #{app.id}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{app.applicantName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/tan"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Back to list
          </Link>
          {isAdmin && (
            <>
              <Link
                to={`/tan/${app.id}/edit`}
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
          <Field label="Category" value={APPLICANT_CATEGORY_LABELS[app.applicantCategory]} />
          <Field label="Form Number" value={getTanFormNumber(app.applicationType, app.applicantCategory)} />
          {app.otherCategoryDetail && <Field label="Category Detail" value={app.otherCategoryDetail} />}
          <Field label="Name" value={app.applicantName} full />
          <Field label="Date of Incorporation / Birth" value={formatDate(app.dob)} />
          <Field label="Mobile" value={app.mobile} />
          <Field label="Application Type" value={app.applicationType === "NEW" ? "New (Form 49B)" : "Correction"} />
          {app.existingTan && <Field label="Existing TAN" value={app.existingTan} />}
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
                  : app.paymentMode
            }
            full
          />
        </Section>

        <Section title="Acknowledgement" borderColor="border-l-emerald-500">
          <Field label="Acknowledgement Number" value={app.ackNumber ?? "Not yet available"} full />
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
                  <Link to={`/tan/${app.adjustedFrom.id}`} className="text-indigo-600 hover:underline dark:text-indigo-400">
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
                    <Link to={`/tan/${app.adjustedTo.id}`} className="text-indigo-600 hover:underline dark:text-indigo-400">
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
