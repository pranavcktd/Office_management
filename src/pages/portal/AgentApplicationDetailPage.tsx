import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { api, extractErrorMessage } from "../../api/client";
import { TrackingButton } from "../../components/TrackingButton";
import {
  APPLICANT_CATEGORY_LABELS,
  CREDIT_STATUS_LABELS,
  REJECTION_LABELS,
  RESIDENCY_STATUS_LABELS,
  STATUS_LABELS,
} from "../../types";
import type {
  ApplicantCategory,
  CreditStatus,
  FormStatus,
  PanApplicantStatus,
  RejectionReason,
  ResidencyStatus,
} from "../../types";
import { formatDate, formatDateTime } from "../../utils/date";
import { getPanFormNumber, getTanFormNumber } from "../../utils/formNumbers";

interface AgentApplicationDetail {
  module: "PAN" | "TAN";
  id: number;
  applicantName: string;
  fatherName?: string | null;
  mobile?: string | null;
  email?: string | null;
  dob?: string | null;
  applicationType: "NEW" | "CORRECTION";
  // PAN-only
  applicantStatus?: PanApplicantStatus;
  residencyStatus?: ResidencyStatus;
  existingPan?: string | null;
  aadhaarNumber?: string | null;
  signedStatus?: "SIGNATURE" | "THUMB";
  punchingDate?: string | null;
  // TAN-only
  applicantCategory?: ApplicantCategory;
  otherCategoryDetail?: string | null;
  existingTan?: string | null;
  // Shared
  ackNumber?: string | null;
  feeAmount: string;
  standardFeeAmount?: string | null;
  paymentMode: string;
  paymentOtherDetail?: string | null;
  onlinePaymentDetail?: string | null;
  status: FormStatus;
  rejectionReason?: RejectionReason | null;
  rejectionOtherDetail?: string | null;
  rejectionDate?: string | null;
  adjustmentAvailable: boolean;
  adjustmentExpiredAt?: string | null;
  adjustedFrom?: { id: number; applicantName: string; rejectionReason?: RejectionReason | null; rejectionDate?: string | null } | null;
  adjustedTo?: { id: number; applicantName: string; createdAt: string } | null;
  formReceivedDate?: string | null;
  createdAt: string;
  createdBy?: { id: number; fullName: string } | null;
  notes?: string | null;
}

function creditStatusOf(app: AgentApplicationDetail): CreditStatus | null {
  if (app.status !== "REJECTED") return null;
  if (app.adjustmentAvailable) return "AVAILABLE";
  if (app.adjustmentExpiredAt) return "TIME_BARRED";
  return "USED";
}

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

export function AgentApplicationDetailPage() {
  const { module, id } = useParams();
  const [app, setApp] = useState<AgentApplicationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AgentApplicationDetail>(`/agent-portal/applications/${module}/${id}`)
      .then(({ data }) => setApp(data))
      .catch((err) => setError(extractErrorMessage(err)));
  }, [module, id]);

  if (error) {
    return (
      <div className="px-6 py-8">
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>
      </div>
    );
  }
  if (!app) return <div className="px-6 py-8 text-sm text-slate-500">Loading…</div>;

  const credit = creditStatusOf(app);
  const formNumber =
    app.module === "PAN"
      ? getPanFormNumber(app.applicationType, app.residencyStatus ?? "RESIDENT", app.applicantStatus ?? "INDIVIDUAL")
      : getTanFormNumber(app.applicationType, app.applicantCategory ?? "INDIVIDUAL");

  const hasRejectionOrAdjustment = app.status === "REJECTED" || (app.paymentMode === "ADJUSTED" && app.adjustedFrom);

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {app.module} Application #{app.id}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{app.applicantName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TrackingButton module={app.module} />
          <Link
            to="/portal/applications"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Back to list
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Section title="Applicant Details" borderColor="border-l-indigo-500">
          <Field label="Application Type" value={app.applicationType === "NEW" ? "New" : "Correction"} />
          <Field label="Form Number" value={formNumber} />
          {app.module === "PAN" && app.applicantStatus && (
            <Field label="Category" value={app.applicantStatus === "INDIVIDUAL" ? "Individual" : "Non-Individual"} />
          )}
          {app.module === "PAN" && app.residencyStatus && (
            <Field label="Residency Status" value={RESIDENCY_STATUS_LABELS[app.residencyStatus]} />
          )}
          {app.module === "PAN" && app.existingPan && <Field label="PAN Number" value={app.existingPan} />}
          {app.module === "TAN" && app.applicantCategory && (
            <Field label="Category" value={APPLICANT_CATEGORY_LABELS[app.applicantCategory]} />
          )}
          {app.module === "TAN" && app.otherCategoryDetail && <Field label="Category Detail" value={app.otherCategoryDetail} />}
          {app.module === "TAN" && app.existingTan && <Field label="Existing TAN" value={app.existingTan} />}
          <Field label="Applicant Name" value={app.applicantName} full />
          {app.fatherName && <Field label="Father's Name" value={app.fatherName} />}
          <Field label="Date of Birth" value={formatDate(app.dob)} />
          <Field label="Mobile" value={app.mobile} />
          {app.module === "PAN" && <Field label="Email" value={app.email} />}
          {app.module === "PAN" && <Field label="Aadhaar" value={app.aadhaarNumber} />}
          {app.module === "PAN" && app.signedStatus && (
            <Field label="Signed Status" value={app.signedStatus === "SIGNATURE" ? "Physical Signature" : "Thumb Impression"} />
          )}
        </Section>

        <Section title="Entry & Source" borderColor="border-l-blue-500">
          <Field label="Form Received Date" value={formatDate(app.formReceivedDate)} />
          <Field label="Entry Date & Time" value={formatDateTime(app.createdAt)} />
          {app.createdBy?.fullName && <Field label="Entered By" value={app.createdBy.fullName} full />}
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
          {app.module === "PAN" && (
            <Field label="Punching Date at Protean" value={app.punchingDate ? formatDate(app.punchingDate) : undefined} full />
          )}
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
                  <Link
                    to={`/portal/applications/${app.module}/${app.adjustedFrom.id}`}
                    className="text-indigo-600 hover:underline dark:text-indigo-400"
                  >
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
          {credit && (
            <Field
              label="Adjustment Credit"
              full
              value={
                <>
                  {CREDIT_STATUS_LABELS[credit]}
                  {credit === "TIME_BARRED" && app.adjustmentExpiredAt ? ` (on ${formatDate(app.adjustmentExpiredAt)})` : ""}
                  {credit === "USED" && app.adjustedTo && (
                    <>
                      {" by "}
                      <Link
                        to={`/portal/applications/${app.module}/${app.adjustedTo.id}`}
                        className="text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        #{app.adjustedTo.id} — {app.adjustedTo.applicantName}
                      </Link>
                      {` (on ${formatDate(app.adjustedTo.createdAt)})`}
                    </>
                  )}
                </>
              }
            />
          )}
        </Section>
      </div>
    </div>
  );
}
