import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { hashAadhaar } from "../../utils/crypto";
import { exportPdf, exportXlsx } from "../../utils/export";
import type { ExportColumn } from "../../utils/export";
import { paginatedResponse, paginationQuerySchema } from "../../utils/pagination";
import { localDateRange } from "../../utils/dateRange";
import { computeDailyActivity, todayYmdLocal } from "../../utils/dailyActivity";
import { exportDailyActivityPdf, exportDailyActivityXlsx } from "../../utils/dailyActivityReport";

const REJECTION_REASONS = ["ALREADY_ISSUED", "DEMOGRAPHIC_FAILED", "DATA_INCOMPLETE", "SIGNATURE_PHOTO_MISMATCH", "OTHER"] as const;

// One search box has to cover name, mobile, and agent name on both PAN and TAN — kept untyped
// (rather than Prisma.PanApplicationWhereInput[]) so the same literal shape structurally
// satisfies either model's `OR` field at the call site.
function baseSearchClauses(q: string) {
  return [
    { applicantName: { contains: q, mode: "insensitive" as const } },
    { mobile: { contains: q } },
    { agent: { agentName: { contains: q, mode: "insensitive" as const } } },
  ];
}

// PAN-only: Aadhaar (last 4 digits, or the full 12-digit number matched via its deterministic
// hash; never a plaintext substring match since Aadhaar is stored encrypted).
function aadhaarSearchClause(q: string): { aadhaarHash: string } | { aadhaarLast4: string } | null {
  const digits = q.replace(/\D/g, "");
  if (digits.length === 12) return { aadhaarHash: hashAadhaar(digits) };
  if (digits.length === 4 && digits === q.trim()) return { aadhaarLast4: digits };
  return null;
}

function panSearchOr(q: string) {
  const aadhaar = aadhaarSearchClause(q);
  return aadhaar ? [...baseSearchClauses(q), aadhaar] : baseSearchClauses(q);
}

const baseFiltersSchema = z.object({
  module: z.enum(["PAN", "TAN", "ALL"]).default("ALL"),
  agentId: z.coerce.number().int().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().optional(),
});

const rejectedFiltersSchema = baseFiltersSchema.extend({
  rejectionReason: z.enum(REJECTION_REASONS).optional(),
});

const creditStatusFiltersSchema = rejectedFiltersSchema.extend({
  creditStatus: z.enum(["AVAILABLE", "TIME_BARRED", "USED"]).optional(),
});

// All date-range filters in this module mean "entry date" (createdAt) — see utils/dateRange.ts
// for why local calendar-day bounds are used instead of UTC midnight.
const dateRange = localDateRange;

interface RejectedRow {
  module: "PAN" | "TAN";
  id: number;
  applicantName: string;
  mobile: string | null;
  agentName: string | null;
  rejectionReason: string | null;
  rejectionOtherDetail: string | null;
  rejectionDate: Date | null;
  formReceivedDate: Date | null;
  createdAt: Date;
  creditStatus: "AVAILABLE" | "TIME_BARRED" | "USED";
  adjustmentExpiredAt: Date | null;
}

function creditStatusOf(row: { adjustmentAvailable: boolean; adjustmentExpiredAt: Date | null; adjustedTo: { id: number } | null }): "AVAILABLE" | "TIME_BARRED" | "USED" {
  if (row.adjustmentAvailable) return "AVAILABLE";
  if (row.adjustedTo) return "USED";
  return "TIME_BARRED";
}

async function fetchRejectedRows(filters: z.infer<typeof creditStatusFiltersSchema>): Promise<RejectedRow[]> {
  const { module, agentId, dateFrom, dateTo, rejectionReason, q, creditStatus } = filters;
  // "Rejected" and "Credit Status" report on entry date (createdAt) — when the form was entered
  // into the system — not when it was later marked rejected.
  const createdAt = dateRange(dateFrom, dateTo);

  const rows: RejectedRow[] = [];

  if (module === "PAN" || module === "ALL") {
    const pan = await prisma.panApplication.findMany({
      where: {
        status: "REJECTED",
        agentId,
        rejectionReason,
        ...(createdAt ? { createdAt } : {}),
        ...(q ? { OR: panSearchOr(q) } : {}),
      },
      include: { agent: { select: { agentName: true } }, adjustedTo: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
    });
    rows.push(
      ...pan.map((r) => ({
        module: "PAN" as const,
        id: r.id,
        applicantName: r.applicantName,
        mobile: r.mobile,
        agentName: r.agent?.agentName ?? "Office",
        rejectionReason: r.rejectionReason,
        rejectionOtherDetail: r.rejectionOtherDetail,
        rejectionDate: r.rejectionDate,
        formReceivedDate: r.formReceivedDate,
        createdAt: r.createdAt,
        creditStatus: creditStatusOf(r),
        adjustmentExpiredAt: r.adjustmentExpiredAt,
      }))
    );
  }

  if (module === "TAN" || module === "ALL") {
    const tan = await prisma.tanApplication.findMany({
      where: {
        status: "REJECTED",
        agentId,
        rejectionReason,
        ...(createdAt ? { createdAt } : {}),
        ...(q ? { OR: baseSearchClauses(q) } : {}),
      },
      include: { agent: { select: { agentName: true } }, adjustedTo: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
    });
    rows.push(
      ...tan.map((r) => ({
        module: "TAN" as const,
        id: r.id,
        applicantName: r.applicantName,
        mobile: r.mobile,
        agentName: r.agent?.agentName ?? "Office",
        rejectionReason: r.rejectionReason,
        rejectionOtherDetail: r.rejectionOtherDetail,
        rejectionDate: r.rejectionDate,
        formReceivedDate: r.formReceivedDate,
        createdAt: r.createdAt,
        creditStatus: creditStatusOf(r),
        adjustmentExpiredAt: r.adjustmentExpiredAt,
      }))
    );
  }

  const filtered = creditStatus ? rows.filter((r) => r.creditStatus === creditStatus) : rows;
  filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return filtered;
}

export const listRejectedReport = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, ...filters } = rejectedFiltersSchema.merge(paginationQuerySchema).parse(req.query);
  const rows = await fetchRejectedRows({ ...filters, creditStatus: undefined });
  const start = (page - 1) * pageSize;
  res.json(paginatedResponse(rows.slice(start, start + pageSize), rows.length, page, pageSize));
});

export const exportRejectedReport = asyncHandler(async (req: Request, res: Response) => {
  const format = req.query.format === "pdf" ? "pdf" : "xlsx";
  const filters = rejectedFiltersSchema.parse(req.query);
  const rows = await fetchRejectedRows({ ...filters, creditStatus: undefined });

  const columns: ExportColumn<RejectedRow>[] = [
    { header: "Module", value: (r) => r.module },
    { header: "ID", value: (r) => String(r.id) },
    { header: "Applicant", value: (r) => r.applicantName },
    { header: "Mobile", value: (r) => r.mobile ?? "" },
    { header: "Source", value: (r) => r.agentName ?? "Office" },
    { header: "Rejection Reason", value: (r) => r.rejectionReason ?? "" },
    { header: "Rejection Date", value: (r) => r.rejectionDate?.toISOString().slice(0, 10) ?? "" },
    { header: "Entry Date", value: (r) => r.createdAt.toISOString().slice(0, 10) },
    { header: "Credit Status", value: (r) => r.creditStatus },
  ];

  if (format === "pdf") exportPdf(res, "rejected-report", "Rejected Forms Report", columns, rows);
  else await exportXlsx(res, "rejected-report", columns, rows);
});

interface AdjustedRow {
  module: "PAN" | "TAN";
  id: number;
  applicantName: string;
  mobile: string | null;
  agentName: string | null;
  createdAt: Date;
  originalId: number | null;
  originalApplicantName: string | null;
}

export const listAdjustedReport = asyncHandler(async (req: Request, res: Response) => {
  const { module, agentId, dateFrom, dateTo, q, page, pageSize } = baseFiltersSchema.merge(paginationQuerySchema).parse(req.query);
  const createdAt = dateRange(dateFrom, dateTo);
  const rows: AdjustedRow[] = [];

  if (module === "PAN" || module === "ALL") {
    const pan = await prisma.panApplication.findMany({
      where: {
        paymentMode: "ADJUSTED",
        agentId,
        ...(createdAt ? { createdAt } : {}),
        ...(q ? { OR: panSearchOr(q) } : {}),
      },
      include: { agent: { select: { agentName: true } }, adjustedFrom: { select: { id: true, applicantName: true } } },
      orderBy: { createdAt: "desc" },
    });
    rows.push(
      ...pan.map((r) => ({
        module: "PAN" as const,
        id: r.id,
        applicantName: r.applicantName,
        mobile: r.mobile,
        agentName: r.agent?.agentName ?? "Office",
        createdAt: r.createdAt,
        originalId: r.adjustedFrom?.id ?? null,
        originalApplicantName: r.adjustedFrom?.applicantName ?? null,
      }))
    );
  }

  if (module === "TAN" || module === "ALL") {
    const tan = await prisma.tanApplication.findMany({
      where: {
        paymentMode: "ADJUSTED",
        agentId,
        ...(createdAt ? { createdAt } : {}),
        ...(q ? { OR: baseSearchClauses(q) } : {}),
      },
      include: { agent: { select: { agentName: true } }, adjustedFrom: { select: { id: true, applicantName: true } } },
      orderBy: { createdAt: "desc" },
    });
    rows.push(
      ...tan.map((r) => ({
        module: "TAN" as const,
        id: r.id,
        applicantName: r.applicantName,
        mobile: r.mobile,
        agentName: r.agent?.agentName ?? "Office",
        createdAt: r.createdAt,
        originalId: r.adjustedFrom?.id ?? null,
        originalApplicantName: r.adjustedFrom?.applicantName ?? null,
      }))
    );
  }

  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const start = (page - 1) * pageSize;
  res.json(paginatedResponse(rows.slice(start, start + pageSize), rows.length, page, pageSize));
});

export const exportAdjustedReport = asyncHandler(async (req: Request, res: Response) => {
  const format = req.query.format === "pdf" ? "pdf" : "xlsx";
  const { module, agentId, dateFrom, dateTo, q } = baseFiltersSchema.parse(req.query);
  const createdAt = dateRange(dateFrom, dateTo);
  const rows: AdjustedRow[] = [];

  if (module === "PAN" || module === "ALL") {
    const pan = await prisma.panApplication.findMany({
      where: { paymentMode: "ADJUSTED", agentId, ...(createdAt ? { createdAt } : {}), ...(q ? { OR: panSearchOr(q) } : {}) },
      include: { agent: { select: { agentName: true } }, adjustedFrom: { select: { id: true, applicantName: true } } },
      orderBy: { createdAt: "desc" },
    });
    rows.push(...pan.map((r) => ({ module: "PAN" as const, id: r.id, applicantName: r.applicantName, mobile: r.mobile, agentName: r.agent?.agentName ?? "Office", createdAt: r.createdAt, originalId: r.adjustedFrom?.id ?? null, originalApplicantName: r.adjustedFrom?.applicantName ?? null })));
  }
  if (module === "TAN" || module === "ALL") {
    const tan = await prisma.tanApplication.findMany({
      where: { paymentMode: "ADJUSTED", agentId, ...(createdAt ? { createdAt } : {}), ...(q ? { OR: baseSearchClauses(q) } : {}) },
      include: { agent: { select: { agentName: true } }, adjustedFrom: { select: { id: true, applicantName: true } } },
      orderBy: { createdAt: "desc" },
    });
    rows.push(...tan.map((r) => ({ module: "TAN" as const, id: r.id, applicantName: r.applicantName, mobile: r.mobile, agentName: r.agent?.agentName ?? "Office", createdAt: r.createdAt, originalId: r.adjustedFrom?.id ?? null, originalApplicantName: r.adjustedFrom?.applicantName ?? null })));
  }
  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const columns: ExportColumn<AdjustedRow>[] = [
    { header: "Module", value: (r) => r.module },
    { header: "New Application ID", value: (r) => String(r.id) },
    { header: "New Applicant", value: (r) => r.applicantName },
    { header: "Mobile", value: (r) => r.mobile ?? "" },
    { header: "Source", value: (r) => r.agentName ?? "Office" },
    { header: "Adjusted Date", value: (r) => r.createdAt.toISOString().slice(0, 10) },
    { header: "Original Application ID", value: (r) => (r.originalId ? String(r.originalId) : "") },
    { header: "Original Applicant", value: (r) => r.originalApplicantName ?? "" },
  ];

  if (format === "pdf") exportPdf(res, "adjusted-report", "Adjusted Forms Report", columns, rows);
  else await exportXlsx(res, "adjusted-report", columns, rows);
});

export const listCreditStatusReport = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, ...filters } = creditStatusFiltersSchema.merge(paginationQuerySchema).parse(req.query);
  const rows = await fetchRejectedRows(filters);
  const start = (page - 1) * pageSize;
  res.json(paginatedResponse(rows.slice(start, start + pageSize), rows.length, page, pageSize));
});

export const exportCreditStatusReport = asyncHandler(async (req: Request, res: Response) => {
  const format = req.query.format === "pdf" ? "pdf" : "xlsx";
  const filters = creditStatusFiltersSchema.parse(req.query);
  const rows = await fetchRejectedRows(filters);

  const columns: ExportColumn<RejectedRow>[] = [
    { header: "Module", value: (r) => r.module },
    { header: "ID", value: (r) => String(r.id) },
    { header: "Applicant", value: (r) => r.applicantName },
    { header: "Mobile", value: (r) => r.mobile ?? "" },
    { header: "Source", value: (r) => r.agentName ?? "Office" },
    { header: "Rejection Reason", value: (r) => r.rejectionReason ?? "" },
    { header: "Rejection Date", value: (r) => r.rejectionDate?.toISOString().slice(0, 10) ?? "" },
    { header: "Entry Date", value: (r) => r.createdAt.toISOString().slice(0, 10) },
    { header: "Credit Status", value: (r) => r.creditStatus },
    { header: "Time Barred On", value: (r) => r.adjustmentExpiredAt?.toISOString().slice(0, 10) ?? "" },
  ];

  if (format === "pdf") exportPdf(res, "credit-status-report", "Adjustment Credit Status Report", columns, rows);
  else await exportXlsx(res, "credit-status-report", columns, rows);
});

// ---------------------------------------------------------------------------
// Data Entry Accuracy — discrepancies caught during a Protean Punching Report import between
// what staff typed in at entry and what Protean's own report says for the same application. See
// utils/importDiscrepancy.ts for how these rows get created.
// ---------------------------------------------------------------------------

const DISCREPANCY_FIELD_LABELS: Record<string, string> = {
  applicantName: "Applicant Name",
  dob: "Date of Birth",
  mobile: "Mobile",
  email: "Email",
  fatherName: "Father's Name",
};

const discrepancyFiltersSchema = z.object({
  module: z.enum(["PAN", "TAN", "ALL"]).default("ALL"),
  staffId: z.coerce.number().int().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  acknowledged: z.enum(["true", "false"]).optional(),
});
type DiscrepancyFilters = z.infer<typeof discrepancyFiltersSchema>;

function discrepancyWhere(filters: DiscrepancyFilters) {
  const detectedAt = dateRange(filters.dateFrom, filters.dateTo);
  return {
    ...(filters.module !== "ALL" ? { module: filters.module } : {}),
    ...(filters.staffId ? { staffId: filters.staffId } : {}),
    ...(detectedAt ? { detectedAt } : {}),
    ...(filters.acknowledged !== undefined ? { acknowledged: filters.acknowledged === "true" } : {}),
  };
}

interface DiscrepancyRow {
  id: number;
  module: string;
  applicationId: number;
  ackNumber: string;
  field: string;
  fieldLabel: string;
  enteredValue: string | null;
  reportValue: string | null;
  staffId: number | null;
  staffName: string | null;
  detectedAt: Date;
  acknowledged: boolean;
  acknowledgedAt: Date | null;
  acknowledgedByName: string | null;
}

async function fetchDiscrepancyRows(filters: DiscrepancyFilters): Promise<DiscrepancyRow[]> {
  const rows = await prisma.importDiscrepancy.findMany({
    where: discrepancyWhere(filters),
    include: { staff: { select: { id: true, fullName: true } }, acknowledgedBy: { select: { id: true, fullName: true } } },
    orderBy: { detectedAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    module: r.module,
    applicationId: r.applicationId,
    ackNumber: r.ackNumber,
    field: r.field,
    fieldLabel: DISCREPANCY_FIELD_LABELS[r.field] ?? r.field,
    enteredValue: r.enteredValue,
    reportValue: r.reportValue,
    staffId: r.staffId,
    staffName: r.staff?.fullName ?? null,
    detectedAt: r.detectedAt,
    acknowledged: r.acknowledged,
    acknowledgedAt: r.acknowledgedAt,
    acknowledgedByName: r.acknowledgedBy?.fullName ?? null,
  }));
}

export const listDiscrepancies = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, ...filters } = discrepancyFiltersSchema.merge(paginationQuerySchema).parse(req.query);
  const rows = await fetchDiscrepancyRows(filters);
  const start = (page - 1) * pageSize;
  res.json(paginatedResponse(rows.slice(start, start + pageSize), rows.length, page, pageSize));
});

export const exportDiscrepancies = asyncHandler(async (req: Request, res: Response) => {
  const format = req.query.format === "pdf" ? "pdf" : "xlsx";
  const filters = discrepancyFiltersSchema.parse(req.query);
  const rows = await fetchDiscrepancyRows(filters);

  const columns: ExportColumn<DiscrepancyRow>[] = [
    { header: "Module", value: (r) => r.module },
    { header: "Application ID", value: (r) => String(r.applicationId) },
    { header: "Ack Number", value: (r) => r.ackNumber },
    { header: "Field", value: (r) => r.fieldLabel },
    { header: "Entered By Staff", value: (r) => r.enteredValue ?? "" },
    { header: "Per Protean Report", value: (r) => r.reportValue ?? "" },
    { header: "Staff", value: (r) => r.staffName ?? "Unknown" },
    { header: "Detected At", value: (r) => r.detectedAt.toISOString().slice(0, 10) },
    { header: "Acknowledged", value: (r) => (r.acknowledged ? "Yes" : "No") },
  ];

  if (format === "pdf") exportPdf(res, "data-entry-accuracy-report", "Data Entry Accuracy Report", columns, rows);
  else await exportXlsx(res, "data-entry-accuracy-report", columns, rows);
});

export const acknowledgeDiscrepancy = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = await prisma.importDiscrepancy.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Discrepancy not found");

  const updated = await prisma.importDiscrepancy.update({
    where: { id },
    data: {
      acknowledged: true,
      acknowledgedAt: new Date(),
      acknowledgedById: req.user?.kind === "staff" ? req.user.id : undefined,
    },
  });
  res.json(updated);
});

// ---------------------------------------------------------------------------
// Daily Activity — "what happened today" at a glance: new entries, new rejections, adjustments
// consuming an earlier rejection's fee credit, and a revenue split (fresh money vs. credit-
// adjusted). Shares its computation with the Dashboard's "Today" section (see utils/
// dailyActivity.ts) so the two numbers can never disagree.
// ---------------------------------------------------------------------------

const dailyActivityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const getDailyActivity = asyncHandler(async (req: Request, res: Response) => {
  const { date } = dailyActivityQuerySchema.parse(req.query);
  const activity = await computeDailyActivity(date ?? todayYmdLocal());
  res.json(activity);
});

export const exportDailyActivity = asyncHandler(async (req: Request, res: Response) => {
  const { date } = dailyActivityQuerySchema.parse(req.query);
  const format = req.query.format === "pdf" ? "pdf" : "xlsx";
  const activity = await computeDailyActivity(date ?? todayYmdLocal());
  if (format === "pdf") exportDailyActivityPdf(res, activity);
  else await exportDailyActivityXlsx(res, activity);
});
