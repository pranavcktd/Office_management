import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { parseDdMmYyyy } from "../../utils/date";
import { lockAndConsumeRejectedForm } from "../../utils/adjustment";
import { exportPdf, exportXlsx } from "../../utils/export";
import type { ExportColumn } from "../../utils/export";
import { getFieldRequirements } from "../../utils/fieldRequirements";
import { getTanFormNumber } from "../../utils/formNumbers";
import { lookupStandardFee } from "../../utils/feeSchedule";
import { logAudit } from "../../utils/audit";
import { findColumnByHeader, loadWorksheet, parseCellDate } from "../../utils/excelImport";
import { paginatedResponse, paginationQuerySchema, toSkipTake } from "../../utils/pagination";
import ExcelJS from "exceljs";

const dateStringSchema = z.string().refine((v) => {
  try {
    parseDdMmYyyy(v);
    return true;
  } catch {
    return false;
  }
}, "must be a valid DD/MM/YYYY date");

function requireField(
  ctx: z.RefinementCtx,
  present: boolean,
  path: string,
  fieldReq: Record<string, boolean>,
  key: string,
  label: string
) {
  if (fieldReq[key] && !present) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message: `${label} is mandatory` });
  }
}

// Field order mirrors the actual counter workflow: Category -> Name -> DOB/DOI -> Mobile ->
// Form Source -> Fee -> Payment Mode -> Notes, plus the conditional New/Correction and
// Agent/Other-category fields. applicantName/dob/mobile/feeAmount required-ness comes from
// the admin-configurable FieldRequirement table (see settings.controller.ts).
const baseCreateTanShape = {
  tanApplicationType: z.enum(["NEW", "CORRECTION"]),
  existingTan: z.string().optional(),
  applicantCategory: z.enum(["INDIVIDUAL", "FIRM", "GOVERNMENT", "PRIVATE_LTD", "OTHER"]),
  otherCategoryDetail: z.string().optional(),
  applicantName: z.string().optional(),
  dob: dateStringSchema.optional(),
  mobile: z.string().regex(/^\d{10}$/, "mobile must be a 10-digit number").optional(),
  sourceType: z.enum(["OFFICE", "AGENT"]),
  agentId: z.number().int().optional(),
  feeAmount: z.number().nonnegative().optional(),
  paymentMode: z.enum(["CASH", "ONLINE", "OTHER", "ADJUSTED"]),
  // Required whenever paymentMode is OTHER.
  paymentOtherDetail: z.string().min(1).optional(),
  // Required whenever paymentMode is ONLINE — who/what account was paid.
  onlinePaymentDetail: z.string().min(1).optional(),
  adjustedFromFormId: z.number().int().optional(),
  // Date the physical form was actually received — distinct from the system entry
  // timestamp (createdAt), since data entry can happen after receipt. Defaults to today
  // client-side, so this is always required rather than admin-configurable.
  formReceivedDate: dateStringSchema,
  notes: z.string().optional(),
};

function buildCreateTanSchema(fieldReq: Record<string, boolean>) {
  return z.object(baseCreateTanShape).superRefine((data, ctx) => {
    if (data.tanApplicationType === "CORRECTION" && !data.existingTan) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["existingTan"], message: "existingTan is mandatory for a Correction application" });
    }
    if (data.applicantCategory === "OTHER" && !data.otherCategoryDetail) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["otherCategoryDetail"], message: "otherCategoryDetail is mandatory when category is Other" });
    }
    requireField(ctx, Boolean(data.applicantName), "applicantName", fieldReq, "applicantName", "Name");
    requireField(ctx, Boolean(data.dob), "dob", fieldReq, "dob", "Date of birth");
    requireField(ctx, Boolean(data.mobile), "mobile", fieldReq, "mobile", "Mobile number");
    requireField(ctx, data.feeAmount !== undefined, "feeAmount", fieldReq, "feeAmount", "Fees paid");
    if (data.sourceType === "AGENT" && !data.agentId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["agentId"], message: "agentId is mandatory when form source is Agent" });
    }
    if (data.paymentMode === "ADJUSTED" && !data.adjustedFromFormId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["adjustedFromFormId"], message: "adjustedFromFormId is mandatory when payment mode is Adjusted" });
    }
    if (data.paymentMode === "OTHER" && !data.paymentOtherDetail) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["paymentOtherDetail"], message: "paymentOtherDetail is mandatory when payment mode is Other" });
    }
    if (data.paymentMode === "ONLINE" && !data.onlinePaymentDetail) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["onlinePaymentDetail"], message: "onlinePaymentDetail is mandatory when payment mode is Online" });
    }
  });
}

export const createTan = asyncHandler(async (req: Request, res: Response) => {
  const fieldReq = await getFieldRequirements("TAN");
  const input = buildCreateTanSchema(fieldReq).parse(req.body);
  const formReceivedDate = parseDdMmYyyy(input.formReceivedDate);

  const standardFeeAmount = await lookupStandardFee({
    module: "TAN",
    applicationType: input.tanApplicationType,
    signedStatus: "",
    sourceType: input.sourceType,
    agentId: input.sourceType === "AGENT" ? input.agentId : null,
    asOf: formReceivedDate,
  });

  const result = await prisma.$transaction(async (tx) => {
    if (input.paymentMode === "ADJUSTED") {
      await lockAndConsumeRejectedForm(
        tx,
        "tan_applications",
        tx.tanApplication,
        input.adjustedFromFormId!
      );
    }

    return tx.tanApplication.create({
      data: {
        applicationType: input.tanApplicationType,
        existingTan: input.existingTan,
        applicantCategory: input.applicantCategory,
        otherCategoryDetail: input.otherCategoryDetail,
        applicantName: input.applicantName ?? "",
        dob: input.dob ? parseDdMmYyyy(input.dob) : null,
        mobile: input.mobile,
        sourceType: input.sourceType,
        agentId: input.sourceType === "AGENT" ? input.agentId : undefined,
        feeAmount: input.feeAmount ?? 0,
        standardFeeAmount: standardFeeAmount ?? undefined,
        paymentMode: input.paymentMode,
        paymentOtherDetail: input.paymentMode === "OTHER" ? input.paymentOtherDetail : undefined,
        onlinePaymentDetail: input.paymentMode === "ONLINE" ? input.onlinePaymentDetail : undefined,
        adjustedFromFormId: input.paymentMode === "ADJUSTED" ? input.adjustedFromFormId : undefined,
        formReceivedDate,
        notes: input.notes,
        createdById: req.user?.kind === "staff" ? req.user.id : undefined,
      },
    });
  });

  res.status(201).json(result);
});

// ---------------------------------------------------------------------------
// Agent pre-submission drafts — see the matching PAN version in pan.controller.ts for the
// full rationale. Nothing is mandatory; staff fills in the rest and finalizes on save.
// ---------------------------------------------------------------------------

const agentDraftTanSchema = z.object({
  tanApplicationType: z.enum(["NEW", "CORRECTION"]).optional(),
  existingTan: z.string().optional(),
  applicantCategory: z.enum(["INDIVIDUAL", "FIRM", "GOVERNMENT", "PRIVATE_LTD", "OTHER"]).optional(),
  otherCategoryDetail: z.string().optional(),
  applicantName: z.string().optional(),
  dob: dateStringSchema.optional(),
  mobile: z.string().regex(/^\d{10}$/, "mobile must be a 10-digit number").optional(),
  notes: z.string().optional(),
});

export const createAgentDraftTan = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.kind !== "agent") throw new ApiError(403, "Agent portal is for agent accounts only");
  const input = agentDraftTanSchema.parse(req.body);

  const created = await prisma.tanApplication.create({
    data: {
      applicationType: input.tanApplicationType ?? "NEW",
      existingTan: input.existingTan,
      applicantCategory: input.applicantCategory ?? "INDIVIDUAL",
      otherCategoryDetail: input.otherCategoryDetail,
      applicantName: input.applicantName ?? "",
      dob: input.dob ? parseDdMmYyyy(input.dob) : null,
      mobile: input.mobile,
      sourceType: "AGENT",
      agentId: req.user.id,
      paymentMode: "CASH",
      status: "AGENT_DRAFT",
      notes: input.notes,
    },
  });
  await logAudit(req, { action: "TAN_AGENT_DRAFT_CREATED", entityType: "tan_applications", entityId: created.id });
  res.status(201).json(created);
});

export const updateAgentDraftTan = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.kind !== "agent") throw new ApiError(403, "Agent portal is for agent accounts only");
  const id = Number(req.params.id);
  const input = agentDraftTanSchema.parse(req.body);

  const existing = await prisma.tanApplication.findFirst({ where: { id, agentId: req.user.id } });
  if (!existing) throw new ApiError(404, "Draft not found");
  if (existing.status !== "AGENT_DRAFT") {
    throw new ApiError(409, "The office has already started processing this form — it can no longer be edited from here");
  }

  const updated = await prisma.tanApplication.update({
    where: { id },
    data: {
      applicationType: input.tanApplicationType ?? existing.applicationType,
      existingTan: input.existingTan,
      applicantCategory: input.applicantCategory ?? existing.applicantCategory,
      otherCategoryDetail: input.otherCategoryDetail,
      applicantName: input.applicantName ?? "",
      dob: input.dob ? parseDdMmYyyy(input.dob) : null,
      mobile: input.mobile,
      notes: input.notes,
    },
  });
  res.json(updated);
});

const standardFeeQuerySchema = z.object({
  applicationType: z.enum(["NEW", "CORRECTION"]),
  sourceType: z.enum(["OFFICE", "AGENT"]),
  agentId: z.coerce.number().int().optional(),
});

export const getStandardFee = asyncHandler(async (req: Request, res: Response) => {
  const input = standardFeeQuerySchema.parse(req.query);
  const amount = await lookupStandardFee({
    module: "TAN",
    applicationType: input.applicationType,
    signedStatus: "",
    sourceType: input.sourceType,
    agentId: input.sourceType === "AGENT" ? input.agentId : null,
  });
  res.json({ amount });
});

const listQuerySchema = z.object({
  status: z.enum(["AGENT_DRAFT", "UNDER_ENTRY", "PUSHED_TO_NSDL", "ACK_GENERATED", "REJECTED"]).optional(),
  sourceType: z.enum(["OFFICE", "AGENT"]).optional(),
  agentId: z.coerce.number().int().optional(),
  applicantCategory: z.enum(["INDIVIDUAL", "FIRM", "GOVERNMENT", "PRIVATE_LTD", "OTHER"]).optional(),
  rejectionReason: z.enum(["ALREADY_ISSUED", "DEMOGRAPHIC_FAILED", "DATA_INCOMPLETE", "SIGNATURE_PHOTO_MISMATCH", "OTHER"]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().optional(),
}).merge(paginationQuerySchema);

function buildTanSearchWhere(filters: {
  status?: "AGENT_DRAFT" | "UNDER_ENTRY" | "PUSHED_TO_NSDL" | "ACK_GENERATED" | "REJECTED";
  sourceType?: "OFFICE" | "AGENT";
  agentId?: number;
  applicantCategory?: "INDIVIDUAL" | "FIRM" | "GOVERNMENT" | "PRIVATE_LTD" | "OTHER";
  rejectionReason?: "ALREADY_ISSUED" | "DEMOGRAPHIC_FAILED" | "DATA_INCOMPLETE" | "SIGNATURE_PHOTO_MISMATCH" | "OTHER";
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Prisma.TanApplicationWhereInput {
  const { q, from, to, page: _page, pageSize: _pageSize, ...rest } = filters;
  return {
    ...rest,
    ...(from || to
      ? {
          formReceivedDate: {
            gte: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
            lte: to ? new Date(`${to}T00:00:00.000Z`) : undefined,
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { applicantName: { contains: q, mode: "insensitive" } },
            { mobile: { contains: q } },
            { existingTan: { contains: q, mode: "insensitive" } },
            { agent: { agentName: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

const tanInclude = {
  agent: { select: { id: true, agentName: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.TanApplicationInclude;

export const listTan = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, ...filters } = listQuerySchema.parse(req.query);
  const where = buildTanSearchWhere(filters);
  const [applications, total] = await Promise.all([
    prisma.tanApplication.findMany({
      where,
      include: tanInclude,
      orderBy: { createdAt: "desc" },
      ...toSkipTake(page, pageSize),
    }),
    prisma.tanApplication.count({ where }),
  ]);
  res.json(paginatedResponse(applications, total, page, pageSize));
});

export const getTan = asyncHandler(async (req: Request, res: Response) => {
  const application = await prisma.tanApplication.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      ...tanInclude,
      adjustedFrom: { select: { id: true, applicantName: true, rejectionReason: true, rejectionDate: true } },
      adjustedTo: { select: { id: true, applicantName: true, createdAt: true } },
    },
  });
  if (!application) throw new ApiError(404, "TAN application not found");
  res.json(application);
});

const updateStatusSchema = z
  .object({
    status: z.enum(["UNDER_ENTRY", "PUSHED_TO_NSDL", "ACK_GENERATED", "REJECTED"]),
    rejectionReason: z
      .enum(["ALREADY_ISSUED", "DEMOGRAPHIC_FAILED", "DATA_INCOMPLETE", "SIGNATURE_PHOTO_MISMATCH", "OTHER"])
      .optional(),
    // Required whenever rejectionReason is OTHER.
    rejectionOtherDetail: z.string().min(1).optional(),
    // The date the rejection actually happened — required whenever marking Rejected.
    rejectionDate: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === "REJECTED" && !data.rejectionReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rejectionReason"],
        message: "rejectionReason is mandatory when marking a form as Rejected",
      });
    }
    if (data.rejectionReason === "OTHER" && !data.rejectionOtherDetail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rejectionOtherDetail"],
        message: "rejectionOtherDetail is mandatory when rejection reason is Other",
      });
    }
    if (data.status === "REJECTED") {
      if (!data.rejectionDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rejectionDate"], message: "rejectionDate is mandatory when marking a form as Rejected" });
      } else {
        try {
          parseDdMmYyyy(data.rejectionDate);
        } catch {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rejectionDate"], message: "rejectionDate must be a valid DD/MM/YYYY date" });
        }
      }
    }
  });

export const updateTanStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const input = updateStatusSchema.parse(req.body);

  const [updated] = await prisma.$transaction([
    prisma.tanApplication.update({
      where: { id },
      data: {
        status: input.status,
        rejectionReason: input.status === "REJECTED" ? input.rejectionReason : null,
        rejectionOtherDetail:
          input.status === "REJECTED" && input.rejectionReason === "OTHER" ? input.rejectionOtherDetail : null,
        rejectionDate: input.status === "REJECTED" ? parseDdMmYyyy(input.rejectionDate!) : null,
        adjustmentAvailable: input.status === "REJECTED" ? true : undefined,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: req.user?.kind === "staff" ? req.user.id : null,
        action: "TAN_STATUS_UPDATE",
        entityType: "tan_applications",
        entityId: id,
        meta: input,
      },
    }),
  ]);

  res.json(updated);
});

// Admin-only editable fields — excludes paymentMode/adjustedFromFormId/status/rejectionReason,
// which have their own dedicated, transaction-guarded flows above.
const baseEditTanShape = {
  tanApplicationType: z.enum(["NEW", "CORRECTION"]),
  existingTan: z.string().optional(),
  applicantCategory: z.enum(["INDIVIDUAL", "FIRM", "GOVERNMENT", "PRIVATE_LTD", "OTHER"]),
  otherCategoryDetail: z.string().optional(),
  applicantName: z.string().optional(),
  dob: dateStringSchema.optional(),
  mobile: z.string().regex(/^\d{10}$/, "mobile must be a 10-digit number").optional(),
  sourceType: z.enum(["OFFICE", "AGENT"]),
  agentId: z.number().int().optional(),
  feeAmount: z.number().nonnegative().optional(),
  formReceivedDate: dateStringSchema,
  notes: z.string().optional(),
};

function buildEditTanSchema(fieldReq: Record<string, boolean>) {
  return z.object(baseEditTanShape).superRefine((data, ctx) => {
    if (data.tanApplicationType === "CORRECTION" && !data.existingTan) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["existingTan"], message: "existingTan is mandatory for a Correction application" });
    }
    if (data.applicantCategory === "OTHER" && !data.otherCategoryDetail) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["otherCategoryDetail"], message: "otherCategoryDetail is mandatory when category is Other" });
    }
    requireField(ctx, Boolean(data.applicantName), "applicantName", fieldReq, "applicantName", "Name");
    requireField(ctx, Boolean(data.dob), "dob", fieldReq, "dob", "Date of birth");
    requireField(ctx, Boolean(data.mobile), "mobile", fieldReq, "mobile", "Mobile number");
    requireField(ctx, data.feeAmount !== undefined, "feeAmount", fieldReq, "feeAmount", "Fees paid");
    if (data.sourceType === "AGENT" && !data.agentId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["agentId"], message: "agentId is mandatory when form source is Agent" });
    }
  });
}

export const updateTan = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const fieldReq = await getFieldRequirements("TAN");
  const input = buildEditTanSchema(fieldReq).parse(req.body);

  const existing = await prisma.tanApplication.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "TAN application not found");

  const formReceivedDate = parseDdMmYyyy(input.formReceivedDate);
  const standardFeeAmount = await lookupStandardFee({
    module: "TAN",
    applicationType: input.tanApplicationType,
    signedStatus: "",
    sourceType: input.sourceType,
    agentId: input.sourceType === "AGENT" ? input.agentId : null,
    asOf: formReceivedDate,
  });

  const [updated] = await prisma.$transaction([
    prisma.tanApplication.update({
      where: { id },
      data: {
        applicationType: input.tanApplicationType,
        existingTan: input.existingTan,
        applicantCategory: input.applicantCategory,
        otherCategoryDetail: input.otherCategoryDetail,
        applicantName: input.applicantName ?? "",
        dob: input.dob ? parseDdMmYyyy(input.dob) : null,
        mobile: input.mobile,
        sourceType: input.sourceType,
        agentId: input.sourceType === "AGENT" ? input.agentId : null,
        feeAmount: input.feeAmount ?? 0,
        standardFeeAmount: standardFeeAmount ?? undefined,
        formReceivedDate,
        notes: input.notes,
        ...(existing.status === "AGENT_DRAFT"
          ? { status: "UNDER_ENTRY" as const, createdById: req.user?.kind === "staff" ? req.user.id : undefined }
          : {}),
      },
      include: tanInclude,
    }),
    prisma.auditLog.create({
      data: {
        actorId: req.user?.kind === "staff" ? req.user.id : null,
        action: "TAN_EDITED",
        entityType: "tan_applications",
        entityId: id,
        meta: { before: existing, after: input },
      },
    }),
  ]);

  res.json(updated);
});

export const deleteTan = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    await prisma.tanApplication.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2003" || err.code === "P2025")) {
      throw new ApiError(
        409,
        err.code === "P2025"
          ? "TAN application not found"
          : "This application is linked to another record (an adjustment or a dispatch entry) and cannot be deleted"
      );
    }
    throw err;
  }
  res.status(204).send();
});

const exportQuerySchema = listQuerySchema;

export const exportTan = asyncHandler(async (req: Request, res: Response) => {
  const format = req.query.format === "pdf" ? "pdf" : "xlsx";
  const filters = exportQuerySchema.parse(req.query);

  const applications = await prisma.tanApplication.findMany({
    where: buildTanSearchWhere(filters),
    include: tanInclude,
    orderBy: { createdAt: "desc" },
  });

  const columns: ExportColumn<(typeof applications)[number]>[] = [
    { header: "ID", value: (r) => String(r.id) },
    { header: "Name", value: (r) => r.applicantName },
    { header: "Category", value: (r) => r.applicantCategory },
    { header: "Form Number", value: (r) => getTanFormNumber(r.applicationType, r.applicantCategory) },
    { header: "Type", value: (r) => r.applicationType },
    { header: "Mobile", value: (r) => r.mobile ?? "" },
    { header: "Source", value: (r) => (r.sourceType === "AGENT" ? r.agent?.agentName ?? "Agent" : "Office") },
    { header: "Payment", value: (r) => r.paymentMode },
    { header: "Fee Paid", value: (r) => r.feeAmount.toString() },
    { header: "Standard Fee", value: (r) => r.standardFeeAmount?.toString() ?? "" },
    { header: "Form Status", value: (r) => r.status },
    { header: "Acknowledgement Number", value: (r) => r.ackNumber ?? "" },
    { header: "Rejection Reason", value: (r) => r.rejectionReason ?? "" },
    { header: "Rejection Date", value: (r) => r.rejectionDate?.toISOString().slice(0, 10) ?? "" },
    { header: "Form Received", value: (r) => r.formReceivedDate?.toISOString().slice(0, 10) ?? "" },
    { header: "Entry Date & Time", value: (r) => r.createdAt.toISOString() },
    { header: "Entered By", value: (r) => r.createdBy?.fullName ?? "" },
  ];

  if (format === "pdf") {
    exportPdf(res, "tan-applications", "TAN Applications", columns, applications);
  } else {
    await exportXlsx(res, "tan-applications", columns, applications);
  }
});

// Mirrors PAN's adjustment lookup: Form Source here is about where the OLD rejected form
// came from, independent of the new form's own source; Office lookups list every eligible
// rejected form and narrow with a free-text keyword (`q`).
const candidatesQuerySchema = z
  .object({
    sourceType: z.enum(["OFFICE", "AGENT"]),
    agentId: z.coerce.number().int().optional(),
    q: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.sourceType === "AGENT" && !data.agentId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["agentId"], message: "agentId is required" });
    }
  });

export const getAdjustmentCandidates = asyncHandler(async (req: Request, res: Response) => {
  const input = candidatesQuerySchema.parse(req.query);

  const where: Prisma.TanApplicationWhereInput =
    input.sourceType === "AGENT"
      ? { agentId: input.agentId, sourceType: "AGENT", status: "REJECTED", adjustmentAvailable: true }
      : { sourceType: "OFFICE", status: "REJECTED", adjustmentAvailable: true };

  if (input.q) {
    where.OR = [
      { applicantName: { contains: input.q, mode: "insensitive" } },
      { mobile: { contains: input.q } },
    ];
  }

  const candidates = await prisma.tanApplication.findMany({
    where,
    select: {
      id: true,
      applicantName: true,
      mobile: true,
      feeAmount: true,
      rejectionReason: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  res.json(candidates);
});

type TanMatchFieldKey = "name" | "mobile" | "dob";

/**
 * Bulk-matches a TIN-FC acknowledgement export against pending TAN applications and records the
 * ack number — mirrors PAN's importAckReport (pan.controller.ts), minus Aadhaar as a match
 * option since TanApplication has no Aadhaar field. Which columns to read and which fields to
 * match on is configured via AckImportMapping (module "TAN") under Settings → Acknowledgement
 * Import, not guessed at import time.
 */
export const importTanAckReport = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, "No file uploaded — attach the TIN-FC acknowledgement report as 'file'");
  }

  const mapping = await prisma.ackImportMapping.findUnique({ where: { module: "TAN" } });
  if (!mapping) {
    throw new ApiError(
      400,
      "No import column mapping is configured yet for TAN. Set it up under Settings → Acknowledgement Import first."
    );
  }

  const worksheet = await loadWorksheet(req.file);
  const headerRow = worksheet.getRow(1);

  const ackCol = findColumnByHeader(headerRow, mapping.ackNumberHeader);
  if (!ackCol) {
    throw new ApiError(
      400,
      `Configured Acknowledgement Number column "${mapping.ackNumberHeader}" was not found in row 1 of the uploaded file.`
    );
  }

  const matchColumns: Array<{ key: TanMatchFieldKey; header: string; col: number }> = [];
  const configuredMatchHeaders: Array<[TanMatchFieldKey, string | null]> = [
    ["name", mapping.matchNameHeader],
    ["mobile", mapping.matchMobileHeader],
    ["dob", mapping.matchDobHeader],
  ];
  for (const [key, header] of configuredMatchHeaders) {
    if (!header) continue;
    const col = findColumnByHeader(headerRow, header);
    if (!col) {
      throw new ApiError(400, `Configured "${header}" column (matching by ${key}) was not found in row 1 of the uploaded file.`);
    }
    matchColumns.push({ key, header, col });
  }
  if (matchColumns.length === 0) {
    throw new ApiError(
      400,
      "No match columns are configured. Set at least one (e.g. Name) under Settings → Acknowledgement Import."
    );
  }

  const results: Array<{
    row: number;
    outcome: "matched" | "skipped" | "unmatched" | "ambiguous";
    reason?: string;
    tanApplicationId?: number;
    applicantName?: string;
    ackNumber?: string;
  }> = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const ackNumber = String(row.getCell(ackCol).value ?? "").trim();

    const where: Prisma.TanApplicationWhereInput = { status: "UNDER_ENTRY" };
    const matchedSummary: string[] = [];
    let rowHasAnyValue = Boolean(ackNumber);
    let invalidReason: string | null = null;

    for (const field of matchColumns) {
      const rawValue = row.getCell(field.col).value;

      if (field.key === "name") {
        const name = String(rawValue ?? "").trim();
        if (!name) {
          if (!invalidReason) invalidReason = "Missing Name";
          continue;
        }
        rowHasAnyValue = true;
        where.applicantName = { equals: name, mode: "insensitive" };
        matchedSummary.push(`Name "${name}"`);
      } else if (field.key === "mobile") {
        const mobile = String(rawValue ?? "").trim();
        if (!mobile) {
          if (!invalidReason) invalidReason = "Missing Mobile";
          continue;
        }
        rowHasAnyValue = true;
        where.mobile = mobile;
        matchedSummary.push(`Mobile ${mobile}`);
      } else if (field.key === "dob") {
        const date = parseCellDate(rawValue);
        if (!date) {
          if (!invalidReason) invalidReason = "Missing or invalid Date of Incorporation/Birth";
          continue;
        }
        rowHasAnyValue = true;
        where.dob = date;
        matchedSummary.push(`DOB ${date.toISOString().slice(0, 10)}`);
      }
    }

    if (!rowHasAnyValue) continue; // fully blank row

    if (invalidReason) {
      results.push({ row: rowNumber, outcome: "skipped", reason: invalidReason });
      continue;
    }
    if (!ackNumber) {
      results.push({ row: rowNumber, outcome: "skipped", reason: "Missing acknowledgement number" });
      continue;
    }

    const candidates = await prisma.tanApplication.findMany({ where, orderBy: { createdAt: "desc" } });

    if (candidates.length === 0) {
      results.push({
        row: rowNumber,
        outcome: "unmatched",
        reason: `No pending application matches ${matchedSummary.join(" + ")}`,
      });
      continue;
    }
    if (candidates.length > 1) {
      results.push({
        row: rowNumber,
        outcome: "ambiguous",
        reason: `${candidates.length} pending applications match ${matchedSummary.join(" + ")} — add another match field (e.g. Mobile) under Settings to disambiguate`,
      });
      continue;
    }

    const candidate = candidates[0];
    await prisma.$transaction([
      prisma.tanApplication.update({
        where: { id: candidate.id },
        data: { status: "ACK_GENERATED", ackNumber },
      }),
      prisma.auditLog.create({
        data: {
          actorId: req.user?.kind === "staff" ? req.user.id : null,
          action: "TAN_ACK_IMPORTED",
          entityType: "tan_applications",
          entityId: candidate.id,
          meta: { ackNumber, sourceRow: rowNumber, sourceFile: req.file.originalname, matchedOn: matchedSummary },
        },
      }),
    ]);

    results.push({
      row: rowNumber,
      outcome: "matched",
      tanApplicationId: candidate.id,
      applicantName: candidate.applicantName,
      ackNumber,
    });
  }

  res.json({
    totalRows: results.length,
    matched: results.filter((r) => r.outcome === "matched").length,
    unmatched: results.filter((r) => r.outcome === "unmatched").length,
    ambiguous: results.filter((r) => r.outcome === "ambiguous").length,
    skipped: results.filter((r) => r.outcome === "skipped").length,
    results,
  });
});

// ---------------------------------------------------------------------------
// Bulk create-from-Excel — fixed column layout, mirrors PAN's importer. ADJUSTED payment
// mode isn't supported here (picking a specific rejected form to adjust against is an
// interactive lookup that doesn't translate to a bulk row).
// ---------------------------------------------------------------------------

const TAN_IMPORT_HEADERS = [
  "Category", "Category Detail", "Name", "Date of Incorporation or Birth", "Mobile",
  "Application Type", "Existing TAN", "Source", "Agent Name or Mobile", "Fees Paid",
  "Payment Mode", "Payment Detail", "Form Received Date", "Notes",
] as const;

export const downloadTanImportTemplate = asyncHandler(async (_req: Request, res: Response) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("TAN Import");
  sheet.addRow(TAN_IMPORT_HEADERS as unknown as string[]);
  sheet.addRow([
    "FIRM", "", "Sharma Traders", "01/04/2015", "9876543210",
    "NEW", "", "OFFICE", "", "550",
    "CASH", "", "11/09/2026", "",
  ]);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="tan-import-template.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

interface TanImportRowResult {
  row: number;
  outcome: "created" | "failed";
  reason?: string;
  tanApplicationId?: number;
  applicantName?: string;
}

export const importTanBulk = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(400, "No file uploaded — attach the import file as 'file'");
  const worksheet = await loadWorksheet(req.file);
  const headerRow = worksheet.getRow(1);

  const cols: Record<string, number | undefined> = {};
  for (const header of TAN_IMPORT_HEADERS) {
    cols[header] = findColumnByHeader(headerRow, header);
  }
  const optionalHeaders = new Set(["Category Detail", "Existing TAN", "Agent Name or Mobile", "Payment Detail", "Notes"]);
  const missing = TAN_IMPORT_HEADERS.filter((h) => !optionalHeaders.has(h) && !cols[h]);
  if (missing.length) {
    throw new ApiError(400, `Missing required column(s) in row 1: ${missing.join(", ")}. Download the template for the exact expected headers.`);
  }

  const fieldReq = await getFieldRequirements("TAN");
  const cell = (row: ExcelJS.Row, header: (typeof TAN_IMPORT_HEADERS)[number]): string => {
    const col = cols[header];
    if (!col) return "";
    return String(row.getCell(col).value ?? "").trim();
  };
  // Date cells must reach parseCellDate as the raw ExcelJS value (a Date instance when the
  // column is formatted as a date), not pre-stringified — stringifying a Date first turns it
  // into a JS Date.toString() dump ("Sun Mar 23 1997 ... GMT+0530") that no longer parses.
  const cellRaw = (row: ExcelJS.Row, header: (typeof TAN_IMPORT_HEADERS)[number]): unknown => {
    const col = cols[header];
    return col ? row.getCell(col).value : undefined;
  };

  const results: TanImportRowResult[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const applicantName = cell(row, "Name");
    if (!applicantName && !cell(row, "Mobile")) continue; // fully blank row

    try {
      const applicantCategoryRaw = cell(row, "Category").toUpperCase() || "INDIVIDUAL";
      if (
        applicantCategoryRaw !== "INDIVIDUAL" &&
        applicantCategoryRaw !== "FIRM" &&
        applicantCategoryRaw !== "GOVERNMENT" &&
        applicantCategoryRaw !== "PRIVATE_LTD" &&
        applicantCategoryRaw !== "OTHER"
      ) {
        throw new Error(`Category must be one of INDIVIDUAL, FIRM, GOVERNMENT, PRIVATE_LTD, OTHER, got "${applicantCategoryRaw}"`);
      }
      const applicantCategory = applicantCategoryRaw;
      const otherCategoryDetail = cell(row, "Category Detail");
      if (applicantCategory === "OTHER" && !otherCategoryDetail) throw new Error("Category Detail is mandatory when Category is OTHER");

      const tanApplicationTypeRaw = cell(row, "Application Type").toUpperCase() || "NEW";
      if (tanApplicationTypeRaw !== "NEW" && tanApplicationTypeRaw !== "CORRECTION") {
        throw new Error(`Application Type must be NEW or CORRECTION, got "${tanApplicationTypeRaw}"`);
      }
      const existingTan = cell(row, "Existing TAN");
      if (tanApplicationTypeRaw === "CORRECTION" && !existingTan) throw new Error("Existing TAN is mandatory when Application Type is CORRECTION");

      const sourceRaw = cell(row, "Source").toUpperCase() || "OFFICE";
      if (sourceRaw !== "OFFICE" && sourceRaw !== "AGENT") {
        throw new Error(`Source must be OFFICE or AGENT, got "${sourceRaw}"`);
      }
      const paymentModeRaw = cell(row, "Payment Mode").toUpperCase() || "CASH";
      if (paymentModeRaw !== "CASH" && paymentModeRaw !== "ONLINE" && paymentModeRaw !== "OTHER") {
        throw new Error(`Payment Mode must be CASH, ONLINE, or OTHER (ADJUSTED isn't supported via import), got "${paymentModeRaw}"`);
      }
      const paymentMode = paymentModeRaw;

      if (fieldReq.applicantName && !applicantName) throw new Error("Name is mandatory");
      const dobRaw = cell(row, "Date of Incorporation or Birth");
      if (fieldReq.dob && !dobRaw) throw new Error("Date of Incorporation or Birth is mandatory");
      const mobile = cell(row, "Mobile");
      if (fieldReq.mobile && !mobile) throw new Error("Mobile is mandatory");
      const feeRaw = cell(row, "Fees Paid");
      if (fieldReq.feeAmount && !feeRaw) throw new Error("Fees Paid is mandatory");
      const feeAmount = feeRaw ? Number(feeRaw) : 0;
      if (Number.isNaN(feeAmount)) throw new Error("Fees Paid must be a number");
      const formReceivedRaw = cell(row, "Form Received Date");
      if (!formReceivedRaw) throw new Error("Form Received Date is mandatory");

      let agentId: number | undefined;
      if (sourceRaw === "AGENT") {
        const agentKey = cell(row, "Agent Name or Mobile");
        if (!agentKey) throw new Error("Agent Name or Mobile is mandatory when Source is AGENT");
        const agent = await prisma.agent.findFirst({
          where: { OR: [{ agentName: { equals: agentKey, mode: "insensitive" } }, { mobile: agentKey }] },
        });
        if (!agent) throw new Error(`No agent found matching "${agentKey}"`);
        agentId = agent.id;
      }

      const paymentDetail = cell(row, "Payment Detail");
      if (paymentMode === "OTHER" && !paymentDetail) throw new Error("Payment Detail is mandatory when Payment Mode is OTHER");
      if (paymentMode === "ONLINE" && !paymentDetail) throw new Error("Payment Detail is mandatory when Payment Mode is ONLINE");

      const dob = dobRaw ? parseCellDate(cellRaw(row, "Date of Incorporation or Birth")) : null;
      if (dobRaw && !dob) throw new Error(`Invalid Date of Incorporation or Birth "${dobRaw}" (expected DD/MM/YYYY)`);
      const formReceivedDate = parseCellDate(cellRaw(row, "Form Received Date"));
      if (!formReceivedDate) throw new Error(`Invalid Form Received Date "${formReceivedRaw}" (expected DD/MM/YYYY)`);

      const standardFeeAmount = await lookupStandardFee({
        module: "TAN",
        applicationType: tanApplicationTypeRaw,
        signedStatus: "",
        sourceType: sourceRaw,
        agentId: sourceRaw === "AGENT" ? agentId : null,
        asOf: formReceivedDate,
      });

      const created = await prisma.tanApplication.create({
        data: {
          applicationType: tanApplicationTypeRaw,
          existingTan: tanApplicationTypeRaw === "CORRECTION" ? existingTan : undefined,
          applicantCategory,
          otherCategoryDetail: applicantCategory === "OTHER" ? otherCategoryDetail : undefined,
          applicantName: applicantName || "",
          dob,
          mobile: mobile || undefined,
          sourceType: sourceRaw,
          agentId,
          feeAmount,
          standardFeeAmount: standardFeeAmount ?? undefined,
          paymentMode,
          paymentOtherDetail: paymentMode === "OTHER" ? paymentDetail : undefined,
          onlinePaymentDetail: paymentMode === "ONLINE" ? paymentDetail : undefined,
          formReceivedDate,
          notes: cell(row, "Notes") || undefined,
          createdById: req.user?.kind === "staff" ? req.user.id : undefined,
        },
      });

      await logAudit(req, { action: "TAN_IMPORTED", entityType: "tan_applications", entityId: created.id, meta: { sourceRow: rowNumber, sourceFile: req.file.originalname } });
      results.push({ row: rowNumber, outcome: "created", tanApplicationId: created.id, applicantName: created.applicantName });
    } catch (err) {
      results.push({ row: rowNumber, outcome: "failed", reason: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  res.json({
    totalRows: results.length,
    created: results.filter((r) => r.outcome === "created").length,
    failed: results.filter((r) => r.outcome === "failed").length,
    results,
  });
});
