import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { hashAadhaar } from "../../utils/crypto";
import { exportPdf, exportXlsx } from "../../utils/export";
import type { ExportColumn } from "../../utils/export";
import { paginatedResponse, paginationQuerySchema } from "../../utils/pagination";

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

function dateRange(dateFrom?: string, dateTo?: string) {
  if (!dateFrom && !dateTo) return undefined;
  return {
    gte: dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`) : undefined,
    lte: dateTo ? new Date(`${dateTo}T23:59:59.999Z`) : undefined,
  };
}

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
  const rejectionDate = dateRange(dateFrom, dateTo);

  const rows: RejectedRow[] = [];

  if (module === "PAN" || module === "ALL") {
    const pan = await prisma.panApplication.findMany({
      where: {
        status: "REJECTED",
        agentId,
        rejectionReason,
        ...(rejectionDate ? { rejectionDate } : {}),
        ...(q ? { OR: panSearchOr(q) } : {}),
      },
      include: { agent: { select: { agentName: true } }, adjustedTo: { select: { id: true } } },
      orderBy: { rejectionDate: "desc" },
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
        ...(rejectionDate ? { rejectionDate } : {}),
        ...(q ? { OR: baseSearchClauses(q) } : {}),
      },
      include: { agent: { select: { agentName: true } }, adjustedTo: { select: { id: true } } },
      orderBy: { rejectionDate: "desc" },
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
        creditStatus: creditStatusOf(r),
        adjustmentExpiredAt: r.adjustmentExpiredAt,
      }))
    );
  }

  const filtered = creditStatus ? rows.filter((r) => r.creditStatus === creditStatus) : rows;
  filtered.sort((a, b) => (b.rejectionDate?.getTime() ?? 0) - (a.rejectionDate?.getTime() ?? 0));
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
    { header: "Credit Status", value: (r) => r.creditStatus },
    { header: "Time Barred On", value: (r) => r.adjustmentExpiredAt?.toISOString().slice(0, 10) ?? "" },
  ];

  if (format === "pdf") exportPdf(res, "credit-status-report", "Adjustment Credit Status Report", columns, rows);
  else await exportXlsx(res, "credit-status-report", columns, rows);
});
