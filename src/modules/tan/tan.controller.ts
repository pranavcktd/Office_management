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
import { findColumnByHeaderFragment, loadWorksheet, parseCellDate } from "../../utils/excelImport";
import { nameSimilarity, NAME_SIMILARITY_THRESHOLD } from "../../utils/nameMatch";
import { getProteanMapping } from "../../utils/proteanMapping";
import { compareNameField, recordDiscrepancies } from "../../utils/importDiscrepancy";
import type { FieldDiscrepancy } from "../../utils/importDiscrepancy";
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
    // Adjusted against a rejected form's fee credit — no fresh payment is necessarily taken, so
    // fees paid is never mandatory here regardless of the admin-configured requirement.
    if (data.paymentMode !== "ADJUSTED") {
      requireField(ctx, data.feeAmount !== undefined, "feeAmount", fieldReq, "feeAmount", "Fees paid");
    }
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

  // See pan.controller.ts's createPan for the reasoning: an adjusted form's standardFeeAmount
  // always mirrors whatever was actually collected, never the fee-schedule lookup, since the
  // "adjusting fee" (if any) is an informal per-agent arrangement, not a fixed schedule amount.
  const standardFeeAmount =
    input.paymentMode === "ADJUSTED"
      ? input.feeAmount ?? 0
      : await lookupStandardFee({
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
  // Only meaningful for REJECTED forms — mirrors the 3-state credit logic used in Reports and
  // the agent portal (Available / Time Barred / Used).
  creditStatus: z.enum(["AVAILABLE", "TIME_BARRED", "USED"]).optional(),
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
  creditStatus?: "AVAILABLE" | "TIME_BARRED" | "USED";
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Prisma.TanApplicationWhereInput {
  const { q, from, to, creditStatus, page: _page, pageSize: _pageSize, ...rest } = filters;
  const creditWhere: Prisma.TanApplicationWhereInput =
    creditStatus === "AVAILABLE"
      ? { status: "REJECTED", adjustmentAvailable: true }
      : creditStatus === "TIME_BARRED"
        ? { status: "REJECTED", adjustmentAvailable: false, adjustmentExpiredAt: { not: null } }
        : creditStatus === "USED"
          ? { status: "REJECTED", adjustmentAvailable: false, adjustedTo: { isNot: null } }
          : {};
  return {
    ...rest,
    ...creditWhere,
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

  const existing = await prisma.tanApplication.findUnique({ where: { id }, select: { status: true } });
  if (!existing) throw new ApiError(404, "TAN application not found");
  // See pan.controller.ts's updatePanStatus for the reasoning — same admin-only lock once a
  // form has moved past Under Entry.
  if (existing.status !== "UNDER_ENTRY" && req.user?.role !== "ADMIN") {
    throw new ApiError(403, "Only an admin can change the status of a form that already has an acknowledgement or was already rejected.");
  }

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

// Quick single-form entry for when an acknowledgement/punching date is known for one
// application right away — see pan.controller.ts's updatePanAck for the same pattern. Promotes
// Under Entry/Pushed to Protean -> Acknowledgement Generated automatically.
const updateTanAckSchema = z.object({
  ackNumber: z.string().min(1),
  punchingDate: dateStringSchema.optional(),
});

export const updateTanAck = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const input = updateTanAckSchema.parse(req.body);
  const existing = await prisma.tanApplication.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "TAN application not found");
  // First-time entry (nothing on file yet) is routine staff data entry; correcting an ack
  // number that's already recorded is an admin-only fix.
  if (existing.ackNumber && req.user?.role !== "ADMIN") {
    throw new ApiError(403, "Only an admin can correct an acknowledgement number that's already on file.");
  }

  const [updated] = await prisma.$transaction([
    prisma.tanApplication.update({
      where: { id },
      data: {
        ackNumber: input.ackNumber,
        punchingDate: input.punchingDate ? parseDdMmYyyy(input.punchingDate) : undefined,
        status: existing.status === "UNDER_ENTRY" || existing.status === "PUSHED_TO_NSDL" ? "ACK_GENERATED" : undefined,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: req.user?.kind === "staff" ? req.user.id : null,
        action: "TAN_ACK_ENTERED",
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

function buildEditTanSchema(fieldReq: Record<string, boolean>, isAdjusted: boolean) {
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
    // paymentMode itself isn't editable (see below), so an existing ADJUSTED form's fee credit
    // basis never requires a fresh fees-paid figure, same as at creation time.
    if (!isAdjusted) {
      requireField(ctx, data.feeAmount !== undefined, "feeAmount", fieldReq, "feeAmount", "Fees paid");
    }
    if (data.sourceType === "AGENT" && !data.agentId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["agentId"], message: "agentId is mandatory when form source is Agent" });
    }
  });
}

export const updateTan = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = await prisma.tanApplication.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "TAN application not found");

  const fieldReq = await getFieldRequirements("TAN");
  const input = buildEditTanSchema(fieldReq, existing.paymentMode === "ADJUSTED").parse(req.body);

  const formReceivedDate = parseDdMmYyyy(input.formReceivedDate);
  // See createTan's identical comment; paymentMode itself isn't editable, so this reflects the
  // existing record's mode.
  const standardFeeAmount =
    existing.paymentMode === "ADJUSTED"
      ? input.feeAmount ?? 0
      : await lookupStandardFee({
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
    {
      header: "Paid To / Payment Detail",
      value: (r) => (r.paymentMode === "ONLINE" ? r.onlinePaymentDetail ?? "" : r.paymentMode === "OTHER" ? r.paymentOtherDetail ?? "" : ""),
    },
    { header: "Fee Paid", value: (r) => r.feeAmount.toString() },
    { header: "Standard Fee", value: (r) => r.standardFeeAmount?.toString() ?? "" },
    { header: "Form Status", value: (r) => r.status },
    { header: "Acknowledgement Number", value: (r) => r.ackNumber ?? "" },
    { header: "Rejection Reason", value: (r) => r.rejectionReason ?? "" },
    { header: "Rejection Date", value: (r) => r.rejectionDate?.toISOString().slice(0, 10) ?? "" },
    { header: "Form Received", value: (r) => r.formReceivedDate?.toISOString().slice(0, 10) ?? "" },
    { header: "Entry Date & Time", value: (r) => r.createdAt.toISOString() },
    { header: "Entered By", value: (r) => r.createdBy?.fullName ?? "" },
    { header: "Notes", value: (r) => r.notes ?? "" },
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

// ---------------------------------------------------------------------------
// Protean's own TAN "punching status" report — a fixed export format from their portal
// (Acknowledgment No. / Receipt Date / TAN / Category / Applicant Name / Application Type /
// Changes Requested / User Id / Fees Charged), mirroring PAN's Protean Punching Report importer
// (see pan.controller.ts). Unlike that PAN report, this one carries no mobile or DOB at all, so
// matching falls back to applicant name alone against applications that don't yet have an ack
// number — safe enough at this office's TAN volume, and anything with more than one name-similar
// candidate is always sent to manual review rather than guessed. Which header text to look for is
// admin-configurable (Settings → Protean Report Columns) rather than hardcoded — see
// utils/proteanMapping.ts — so a future wording change doesn't need a code change.
// ---------------------------------------------------------------------------

/** No mobile/DOB signal exists in this report, so matching is name-only — restricted to
 * applications that don't yet carry an ack number, to keep the candidate pool small and the
 * risk of a false-positive name collision low. */
async function findTanProteanMatch(name: string) {
  const pending = await prisma.tanApplication.findMany({ where: { ackNumber: null } });
  return pending.filter((r) => nameSimilarity(r.applicantName, name) >= NAME_SIMILARITY_THRESHOLD);
}

interface TanProteanRowResult {
  row: number;
  outcome: "matched" | "created" | "ambiguous" | "conflict" | "skipped";
  reason?: string;
  tanApplicationId?: number;
  candidateIds?: number[];
  applicantName?: string;
  ackNumber?: string;
  parsedRow?: { punchingDate: string | null };
  discrepancies?: FieldDiscrepancy[];
}

interface TanProteanImportSummary {
  dryRun: boolean;
  detectedColumns: Record<string, boolean>;
  totalRows: number;
  matched: number;
  created: number;
  ambiguous: number;
  conflict: number;
  skipped: number;
  results: TanProteanRowResult[];
}

async function runTanProteanPunchingImport(file: Express.Multer.File, dryRun: boolean): Promise<TanProteanImportSummary> {
  const worksheet = await loadWorksheet(file);
  const headerRow = worksheet.getRow(1);
  const mapping = await getProteanMapping("TAN");

  const findCol = (fragment: string | null) => (fragment ? findColumnByHeaderFragment(headerRow, fragment) : undefined);

  const ackCol = findCol(mapping.ackNumberHeader);
  const nameCol = findCol(mapping.applicantNameHeader);
  const punchingDateCol = findCol(mapping.punchingDateHeader);
  const applicationTypeCol = findCol(mapping.applicationTypeHeader);

  const detectedColumns: Record<string, boolean> = {
    "Acknowledgment No.": Boolean(ackCol),
    "Applicant Name": Boolean(nameCol),
    "Receipt Date": Boolean(punchingDateCol),
    "Application Type": Boolean(applicationTypeCol),
  };

  const missing: string[] = [];
  if (!ackCol) missing.push("Acknowledgment No.");
  if (!nameCol) missing.push("Applicant Name");
  if (missing.length) {
    throw new ApiError(
      400,
      `Missing required column(s) in row 1: ${missing.join(", ")}. Check the configured header text under Settings → Protean Report Columns (TAN), or that this is the report exactly as downloaded from Protean.`
    );
  }

  const cellAt = (row: ExcelJS.Row, col: number | undefined): string => (col ? String(row.getCell(col).value ?? "").trim() : "");

  const results: TanProteanRowResult[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const ackNumber = cellAt(row, ackCol);
    const applicantName = cellAt(row, nameCol);
    if (!ackNumber && !applicantName) continue; // fully blank row

    if (!ackNumber) {
      results.push({ row: rowNumber, outcome: "skipped", reason: "Missing Acknowledgment No." });
      continue;
    }
    if (!applicantName) {
      results.push({ row: rowNumber, outcome: "skipped", reason: "Missing Applicant Name", ackNumber });
      continue;
    }

    const punchingDate = punchingDateCol ? parseCellDate(row.getCell(punchingDateCol).value) : null;
    const applicationTypeRaw = cellAt(row, applicationTypeCol).toUpperCase();
    const applicationType: "NEW" | "CORRECTION" = applicationTypeRaw.startsWith("CORR") ? "CORRECTION" : "NEW";
    const parsedRow = { punchingDate: punchingDate ? punchingDate.toISOString().slice(0, 10) : null };

    // Unlike PAN's report, this one carries no mobile/DOB to confirm identity — name similarity
    // is the only signal — so, unlike PAN's importer, more than one candidate is always sent to
    // manual review rather than auto-applied to all of them; only a single unambiguous match is
    // safe to apply automatically.
    const candidates = await findTanProteanMatch(applicantName);

    if (candidates.length > 1) {
      results.push({
        row: rowNumber,
        outcome: "ambiguous",
        reason: `${candidates.length} pending applications share a similar name — resolve manually`,
        candidateIds: candidates.map((c) => c.id),
        applicantName,
        ackNumber,
        parsedRow,
      });
      continue;
    }

    if (candidates.length > 0) {
      const updatedIds: number[] = [];
      const conflictedIds: number[] = [];
      const rowDiscrepancies: FieldDiscrepancy[] = [];
      for (const existing of candidates) {
        if (existing.ackNumber && existing.ackNumber !== ackNumber) {
          conflictedIds.push(existing.id);
          continue;
        }

        // Matching here is name-similarity only (no mobile/DOB in this report), so any
        // normalized difference from what's already on file is worth flagging — see
        // pan.controller.ts's Protean importer for the same pattern with more fields.
        const discrepancies = [compareNameField("applicantName", existing.applicantName, applicantName)].filter(
          (d): d is FieldDiscrepancy => d !== null
        );

        if (!dryRun) {
          await prisma.tanApplication.update({
            where: { id: existing.id },
            data: {
              ackNumber,
              punchingDate: punchingDate ?? undefined,
              status: existing.status === "UNDER_ENTRY" || existing.status === "PUSHED_TO_NSDL" ? "ACK_GENERATED" : undefined,
            },
          });
          await recordDiscrepancies("TAN", existing.id, ackNumber, existing.createdById, discrepancies);
        }
        rowDiscrepancies.push(...discrepancies);
        updatedIds.push(existing.id);
      }

      if (updatedIds.length > 0) {
        results.push({
          row: rowNumber,
          outcome: "matched",
          tanApplicationId: updatedIds[0],
          candidateIds: updatedIds.length > 1 ? updatedIds : undefined,
          reason:
            candidates.length > 1
              ? `Applied to ${updatedIds.length} matching application(s) (${updatedIds.map((i) => `#${i}`).join(", ")})` +
                (conflictedIds.length ? `; ${conflictedIds.map((i) => `#${i}`).join(", ")} already had a different acknowledgement number and was left untouched` : "")
              : undefined,
          applicantName,
          ackNumber,
          parsedRow,
          discrepancies: rowDiscrepancies.length > 0 ? rowDiscrepancies : undefined,
        });
      } else {
        results.push({
          row: rowNumber,
          outcome: "conflict",
          reason: `${conflictedIds.length > 1 ? "Both matching applications" : `TAN #${conflictedIds[0]}`} already ${conflictedIds.length > 1 ? "have" : "has"} a different acknowledgement number — not overwritten`,
          tanApplicationId: conflictedIds[0],
          candidateIds: conflictedIds.length > 1 ? conflictedIds : undefined,
          applicantName,
          ackNumber,
          parsedRow,
        });
      }
      continue;
    }

    // No pending application matches by name — create a walk-in skeleton straight away, already
    // marked Ack Generated. applicantCategory can't be inferred reliably from Protean's own
    // catch-all Category text, so it defaults to Other for the office to correct on review.
    const createdId = dryRun
      ? undefined
      : (
          await prisma.tanApplication.create({
            data: {
              applicationType,
              applicantCategory: "OTHER",
              applicantName,
              sourceType: "OFFICE",
              feeAmount: 0,
              paymentMode: "CASH",
              status: "ACK_GENERATED",
              ackNumber,
              punchingDate: punchingDate ?? undefined,
              notes: "Backfilled from Protean punching report import — verify and complete remaining details (category, mobile, fees, etc).",
            },
          })
        ).id;
    results.push({ row: rowNumber, outcome: "created", tanApplicationId: createdId, applicantName, ackNumber, parsedRow });
  }

  return {
    dryRun,
    detectedColumns,
    totalRows: results.length,
    matched: results.filter((r) => r.outcome === "matched").length,
    created: results.filter((r) => r.outcome === "created").length,
    ambiguous: results.filter((r) => r.outcome === "ambiguous").length,
    conflict: results.filter((r) => r.outcome === "conflict").length,
    skipped: results.filter((r) => r.outcome === "skipped").length,
    results,
  };
}

export const previewTanProteanPunching = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(400, "No file uploaded — attach the import file as 'file'");
  const summary = await runTanProteanPunchingImport(req.file, true);
  res.json(summary);
});

export const importTanProteanPunching = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(400, "No file uploaded — attach the import file as 'file'");
  const summary = await runTanProteanPunchingImport(req.file, false);

  await logAudit(req, {
    action: "TAN_PROTEAN_PUNCHING_IMPORTED",
    entityType: "tan_applications",
    entityId: 0,
    meta: { sourceFile: req.file.originalname, totalRows: summary.totalRows },
  });

  res.json(summary);
});

/** A reference copy of Protean's own TAN report layout — see pan.controller.ts's
 * downloadPanProteanTemplate for the full reasoning (this is for checking/reference, not
 * something staff fill in by hand; the real report gets uploaded as-is). */
export const downloadTanProteanTemplate = asyncHandler(async (_req: Request, res: Response) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Protean Punching Report");
  sheet.addRow(["Acknowledgment No.", "Receipt Date", "TAN", "Category", "Applicant Name", "Application Type"]);
  sheet.addRow(["794489700060265", new Date(), "NA", "LLP/Firm/Association of persons/Trust/Body of Individuals", "BEAUTY SALON", "New"]);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="tan-protean-punching-report-sample.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});
