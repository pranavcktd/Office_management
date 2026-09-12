import { Request, Response } from "express";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { parseDdMmYyyy } from "../../utils/date";
import { decryptAadhaar, encryptAadhaar, hashAadhaar } from "../../utils/crypto";
import { lockAndConsumeRejectedForm } from "../../utils/adjustment";
import { exportPdf, exportXlsx } from "../../utils/export";
import type { ExportColumn } from "../../utils/export";
import { getFieldRequirements } from "../../utils/fieldRequirements";
import { lookupStandardFee } from "../../utils/feeSchedule";
import { logAudit } from "../../utils/audit";
import { findColumnByHeader, loadWorksheet, parseCellDate } from "../../utils/excelImport";
import { getPanFormNumber } from "../../utils/formNumbers";
import { paginatedResponse, paginationQuerySchema, toSkipTake } from "../../utils/pagination";

const dateStringSchema = z.string().refine((v) => {
  try {
    parseDdMmYyyy(v);
    return true;
  } catch {
    return false;
  }
}, "must be a valid DD/MM/YYYY date");

const baseCreatePanShape = {
  applicationType: z.enum(["NEW", "CORRECTION"]),
  panNumber: z.string().length(10).optional(),
  // Individual vs Non-Individual (companies/firms/trusts/etc.); the latter never asks for
  // father's name or Aadhaar regardless of the field-requirements config below. Combined with
  // residencyStatus, this picks the fresh-application form number (93/94/95/96).
  applicantStatus: z.enum(["INDIVIDUAL", "NON_INDIVIDUAL"]).default("INDIVIDUAL"),
  residencyStatus: z.enum(["RESIDENT", "NON_RESIDENT"]).default("RESIDENT"),
  applicantName: z.string().optional(),
  fatherName: z.string().optional(),
  dob: dateStringSchema.optional(),
  email: z.string().email().optional(),
  mobile: z.string().regex(/^\d{10}$/, "mobile must be a 10-digit number").optional(),
  aadhaarNumber: z.string().regex(/^\d{12}$/, "aadhaarNumber must be 12 digits").optional(),
  signedStatus: z.enum(["SIGNATURE", "THUMB"]),
  sourceType: z.enum(["OFFICE", "AGENT"]),
  agentId: z.number().int().optional(),
  feeAmount: z.number().nonnegative().optional(),
  paymentMode: z.enum(["CASH", "ONLINE", "OTHER", "ADJUSTED"]),
  // Required whenever paymentMode is OTHER — "Other" is never a dead end in this app.
  paymentOtherDetail: z.string().min(1).optional(),
  // Required whenever paymentMode is ONLINE — who/what account was paid.
  onlinePaymentDetail: z.string().min(1).optional(),
  adjustedFromFormId: z.number().int().optional(),
  // Date the physical form was actually received — distinct from the system entry
  // timestamp (createdAt), since data entry can happen after receipt. Defaults to today
  // client-side, so this is always required rather than admin-configurable.
  formReceivedDate: dateStringSchema,
  // When Protean/NSDL was actually punched — usually filled in later, in bulk, via the
  // acknowledgement + punching-date import rather than typed in here. Never mandatory.
  punchingDate: dateStringSchema.optional(),
  notes: z.string().optional(),
};

/** applicantName/dob/mobile/aadhaarNumber/feeAmount get their required-ness from the admin-
 * configurable FieldRequirement table (see settings.controller.ts); everything else here is
 * a structural rule that always applies regardless of that config. */
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

function buildCreatePanSchema(fieldReq: Record<string, boolean>) {
  return z.object(baseCreatePanShape).superRefine((data, ctx) => {
    if (data.applicationType === "CORRECTION" && !data.panNumber) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["panNumber"], message: "panNumber is mandatory for a Correction/CSF application" });
    }
    requireField(ctx, Boolean(data.applicantName), "applicantName", fieldReq, "applicantName", "Applicant name");
    requireField(ctx, Boolean(data.dob), "dob", fieldReq, "dob", "Date of birth");
    requireField(ctx, Boolean(data.mobile), "mobile", fieldReq, "mobile", "Mobile number");
    requireField(ctx, data.feeAmount !== undefined, "feeAmount", fieldReq, "feeAmount", "Fees paid");
    if (data.applicantStatus === "INDIVIDUAL") {
      requireField(ctx, Boolean(data.fatherName), "fatherName", fieldReq, "fatherName", "Father's name");
      requireField(ctx, Boolean(data.aadhaarNumber), "aadhaarNumber", fieldReq, "aadhaarNumber", "Aadhaar number");
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

export const createPan = asyncHandler(async (req: Request, res: Response) => {
  const fieldReq = await getFieldRequirements("PAN");
  const input = buildCreatePanSchema(fieldReq).parse(req.body);
  const formReceivedDate = parseDdMmYyyy(input.formReceivedDate);

  const standardFeeAmount = await lookupStandardFee({
    module: "PAN",
    applicationType: input.applicationType,
    signedStatus: input.signedStatus,
    sourceType: input.sourceType,
    agentId: input.sourceType === "AGENT" ? input.agentId : null,
    asOf: formReceivedDate,
  });

  const result = await prisma.$transaction(async (tx) => {
    if (input.paymentMode === "ADJUSTED") {
      await lockAndConsumeRejectedForm(
        tx,
        "pan_applications",
        tx.panApplication,
        input.adjustedFromFormId!
      );
    }

    const created = await tx.panApplication.create({
      data: {
        applicationType: input.applicationType,
        applicantStatus: input.applicantStatus,
        residencyStatus: input.residencyStatus,
        existingPan: input.panNumber,
        applicantName: input.applicantName ?? "",
        fatherName: input.applicantStatus === "INDIVIDUAL" ? input.fatherName : undefined,
        dob: input.dob ? parseDdMmYyyy(input.dob) : null,
        email: input.email,
        mobile: input.mobile,
        aadhaarEncrypted: input.aadhaarNumber ? encryptAadhaar(input.aadhaarNumber) : undefined,
        aadhaarLast4: input.aadhaarNumber ? input.aadhaarNumber.slice(-4) : undefined,
        aadhaarHash: input.aadhaarNumber ? hashAadhaar(input.aadhaarNumber) : undefined,
        signedStatus: input.signedStatus,
        sourceType: input.sourceType,
        agentId: input.sourceType === "AGENT" ? input.agentId : undefined,
        feeAmount: input.feeAmount ?? 0,
        standardFeeAmount: standardFeeAmount ?? undefined,
        paymentMode: input.paymentMode,
        paymentOtherDetail: input.paymentMode === "OTHER" ? input.paymentOtherDetail : undefined,
        onlinePaymentDetail: input.paymentMode === "ONLINE" ? input.onlinePaymentDetail : undefined,
        adjustedFromFormId: input.paymentMode === "ADJUSTED" ? input.adjustedFromFormId : undefined,
        formReceivedDate,
        punchingDate: input.punchingDate ? parseDdMmYyyy(input.punchingDate) : undefined,
        notes: input.notes,
        createdById: req.user?.kind === "staff" ? req.user.id : undefined,
      },
    });

    return created;
  });

  res.status(201).json(withAadhaarNumber(result));
});

// ---------------------------------------------------------------------------
// Agent pre-submission drafts — an agent can fill in whatever they already know before the
// physical form reaches the office. Nothing is mandatory here (staff fills in the rest and
// validates properly when they finalize it via the normal updatePan flow below), and the
// record starts life as AGENT_DRAFT rather than UNDER_ENTRY so it shows up in a review queue
// instead of mixing into the office's normal in-progress list.
// ---------------------------------------------------------------------------

const agentDraftPanSchema = z.object({
  applicationType: z.enum(["NEW", "CORRECTION"]).optional(),
  panNumber: z.string().length(10).optional(),
  applicantStatus: z.enum(["INDIVIDUAL", "NON_INDIVIDUAL"]).optional(),
  residencyStatus: z.enum(["RESIDENT", "NON_RESIDENT"]).optional(),
  applicantName: z.string().optional(),
  fatherName: z.string().optional(),
  dob: dateStringSchema.optional(),
  email: z.string().email().optional(),
  mobile: z.string().regex(/^\d{10}$/, "mobile must be a 10-digit number").optional(),
  aadhaarNumber: z.string().regex(/^\d{12}$/, "aadhaarNumber must be 12 digits").optional(),
  signedStatus: z.enum(["SIGNATURE", "THUMB"]).optional(),
  notes: z.string().optional(),
});

export const createAgentDraftPan = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.kind !== "agent") throw new ApiError(403, "Agent portal is for agent accounts only");
  const input = agentDraftPanSchema.parse(req.body);

  const created = await prisma.panApplication.create({
    data: {
      applicationType: input.applicationType ?? "NEW",
      applicantStatus: input.applicantStatus ?? "INDIVIDUAL",
      residencyStatus: input.residencyStatus ?? "RESIDENT",
      existingPan: input.panNumber,
      applicantName: input.applicantName ?? "",
      fatherName: input.applicantStatus !== "NON_INDIVIDUAL" ? input.fatherName : undefined,
      dob: input.dob ? parseDdMmYyyy(input.dob) : null,
      email: input.email,
      mobile: input.mobile,
      aadhaarEncrypted: input.aadhaarNumber ? encryptAadhaar(input.aadhaarNumber) : undefined,
      aadhaarLast4: input.aadhaarNumber ? input.aadhaarNumber.slice(-4) : undefined,
      aadhaarHash: input.aadhaarNumber ? hashAadhaar(input.aadhaarNumber) : undefined,
      signedStatus: input.signedStatus ?? "SIGNATURE",
      sourceType: "AGENT",
      agentId: req.user.id,
      paymentMode: "CASH",
      status: "AGENT_DRAFT",
      notes: input.notes,
    },
  });
  await logAudit(req, { action: "PAN_AGENT_DRAFT_CREATED", entityType: "pan_applications", entityId: created.id });
  res.status(201).json(withAadhaarNumber(created));
});

export const updateAgentDraftPan = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.kind !== "agent") throw new ApiError(403, "Agent portal is for agent accounts only");
  const id = Number(req.params.id);
  const input = agentDraftPanSchema.parse(req.body);

  const existing = await prisma.panApplication.findFirst({ where: { id, agentId: req.user.id } });
  if (!existing) throw new ApiError(404, "Draft not found");
  if (existing.status !== "AGENT_DRAFT") {
    throw new ApiError(409, "The office has already started processing this form — it can no longer be edited from here");
  }

  const updated = await prisma.panApplication.update({
    where: { id },
    data: {
      applicationType: input.applicationType ?? existing.applicationType,
      applicantStatus: input.applicantStatus ?? existing.applicantStatus,
      residencyStatus: input.residencyStatus ?? existing.residencyStatus,
      existingPan: input.panNumber,
      applicantName: input.applicantName ?? "",
      fatherName: (input.applicantStatus ?? existing.applicantStatus) !== "NON_INDIVIDUAL" ? input.fatherName : null,
      dob: input.dob ? parseDdMmYyyy(input.dob) : null,
      email: input.email,
      mobile: input.mobile,
      aadhaarEncrypted: input.aadhaarNumber ? encryptAadhaar(input.aadhaarNumber) : null,
      aadhaarLast4: input.aadhaarNumber ? input.aadhaarNumber.slice(-4) : null,
      aadhaarHash: input.aadhaarNumber ? hashAadhaar(input.aadhaarNumber) : null,
      signedStatus: input.signedStatus ?? existing.signedStatus,
      notes: input.notes,
    },
  });
  res.json(withAadhaarNumber(updated));
});

const standardFeeQuerySchema = z.object({
  applicationType: z.enum(["NEW", "CORRECTION"]),
  signedStatus: z.enum(["SIGNATURE", "THUMB"]),
  sourceType: z.enum(["OFFICE", "AGENT"]),
  agentId: z.coerce.number().int().optional(),
});

/** Live "what's the fixed fee for this?" lookup the form calls as applicationType/signedStatus/
 * sourceType/agent change, before the applicant's actual payment is typed in. */
export const getStandardFee = asyncHandler(async (req: Request, res: Response) => {
  const input = standardFeeQuerySchema.parse(req.query);
  const amount = await lookupStandardFee({
    module: "PAN",
    applicationType: input.applicationType,
    signedStatus: input.signedStatus,
    sourceType: input.sourceType,
    agentId: input.sourceType === "AGENT" ? input.agentId : null,
  });
  res.json({ amount });
});

const listQuerySchema = z.object({
  status: z.enum(["AGENT_DRAFT", "UNDER_ENTRY", "PUSHED_TO_NSDL", "ACK_GENERATED", "REJECTED"]).optional(),
  sourceType: z.enum(["OFFICE", "AGENT"]).optional(),
  agentId: z.coerce.number().int().optional(),
  rejectionReason: z.enum(["ALREADY_ISSUED", "DEMOGRAPHIC_FAILED", "DATA_INCOMPLETE", "SIGNATURE_PHOTO_MISMATCH", "OTHER"]).optional(),
  // Filters on formReceivedDate — plain YYYY-MM-DD boundaries from a native date input, not
  // the DD/MM/YYYY used for actually-entered data elsewhere in this app.
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().optional(),
}).merge(paginationQuerySchema);

function buildPanSearchWhere(filters: {
  status?: "AGENT_DRAFT" | "UNDER_ENTRY" | "PUSHED_TO_NSDL" | "ACK_GENERATED" | "REJECTED";
  sourceType?: "OFFICE" | "AGENT";
  agentId?: number;
  rejectionReason?: "ALREADY_ISSUED" | "DEMOGRAPHIC_FAILED" | "DATA_INCOMPLETE" | "SIGNATURE_PHOTO_MISMATCH" | "OTHER";
  from?: string;
  to?: string;
  q?: string;
  // Present when callers pass a listQuerySchema-parsed object straight through — never valid
  // Prisma where-clause keys, so always stripped here rather than trusted to be absent.
  page?: number;
  pageSize?: number;
}): Prisma.PanApplicationWhereInput {
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
    ...(q ? { OR: panSearchClauses(q) } : {}),
  };
}

// A single search box has to cover name, mobile, agent name, and Aadhaar (last 4 digits, or the
// full 12-digit number matched via its deterministic hash — never a plaintext substring match
// since Aadhaar is stored encrypted).
function panSearchClauses(q: string): Prisma.PanApplicationWhereInput[] {
  const clauses: Prisma.PanApplicationWhereInput[] = [
    { applicantName: { contains: q, mode: "insensitive" } },
    { mobile: { contains: q } },
    { existingPan: { contains: q, mode: "insensitive" } },
    { ackNumber: { contains: q, mode: "insensitive" } },
    { agent: { agentName: { contains: q, mode: "insensitive" } } },
  ];
  // "#123" or plain "123" — search by the application's own ID. Bounded to Postgres's 32-bit
  // int range: a 10-digit mobile or 12-digit Aadhaar number parses as a "valid" number too, but
  // handing that straight to an Int column overflows and crashes the query.
  const idMatch = q.trim().replace(/^#/, "");
  if (/^\d+$/.test(idMatch) && Number(idMatch) <= 2147483647) {
    clauses.push({ id: Number(idMatch) });
  }
  const digits = q.replace(/\D/g, "");
  if (digits.length === 12) {
    clauses.push({ aadhaarHash: hashAadhaar(digits) });
  } else if (digits.length === 4 && digits === q.trim()) {
    clauses.push({ aadhaarLast4: digits });
  }
  return clauses;
}

const panInclude = {
  agent: { select: { id: true, agentName: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.PanApplicationInclude;

export const listPan = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, ...filters } = listQuerySchema.parse(req.query);
  const where = buildPanSearchWhere(filters);
  const [applications, total] = await Promise.all([
    prisma.panApplication.findMany({
      where,
      include: panInclude,
      orderBy: { createdAt: "desc" },
      ...toSkipTake(page, pageSize),
    }),
    prisma.panApplication.count({ where }),
  ]);
  res.json(paginatedResponse(applications.map(withAadhaarNumber), total, page, pageSize));
});

export const getPan = asyncHandler(async (req: Request, res: Response) => {
  const application = await prisma.panApplication.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      ...panInclude,
      // Full adjustment trail: which rejected form this one's credit came from (if it's the
      // ADJUSTED resubmission), and which new form used this one's credit (if this one is the
      // rejected original and its credit was consumed) — so "why rejected / used by whom" is
      // answerable straight from the detail page instead of hunting through Reports.
      adjustedFrom: { select: { id: true, applicantName: true, rejectionReason: true, rejectionDate: true } },
      adjustedTo: { select: { id: true, applicantName: true, createdAt: true } },
    },
  });
  if (!application) throw new ApiError(404, "PAN application not found");
  res.json(withAadhaarNumber(application));
});

function withAadhaarNumber<
  T extends { aadhaarEncrypted?: string | null; aadhaarLast4?: string | null; aadhaarHash?: string | null }
>(application: T) {
  const { aadhaarEncrypted, aadhaarHash, ...rest } = application;
  return {
    ...rest,
    aadhaarNumber: aadhaarEncrypted ? decryptAadhaar(aadhaarEncrypted) : null,
  };
}

// Staff only ever choose between these two manually: pushing to Protean isn't a tracked
// step, and Ack Generated is set automatically by importAckReport() below, matched by
// Aadhaar against the TIN-FC report — not something typed in by hand.
const updateStatusSchema = z
  .object({
    status: z.enum(["UNDER_ENTRY", "REJECTED"]),
    rejectionReason: z
      .enum(["ALREADY_ISSUED", "DEMOGRAPHIC_FAILED", "DATA_INCOMPLETE", "SIGNATURE_PHOTO_MISMATCH", "OTHER"])
      .optional(),
    // Required whenever rejectionReason is OTHER.
    rejectionOtherDetail: z.string().min(1).optional(),
    // The date the rejection actually happened — required whenever marking Rejected, so
    // rejection logs can be tracked by when it occurred rather than only when it was recorded.
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

export const updatePanStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const input = updateStatusSchema.parse(req.body);

  const [updated] = await prisma.$transaction([
    prisma.panApplication.update({
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
        action: "PAN_STATUS_UPDATE",
        entityType: "pan_applications",
        entityId: id,
        meta: input,
      },
    }),
  ]);

  res.json(withAadhaarNumber(updated));
});

// Quick single-form entry for when an acknowledgement/punching date is known for one
// application right away (counter staff spot-checking against a physical receipt, correcting
// a row the bulk ack import couldn't match) — the bulk importer above is for batches. Promotes
// Under Entry -> Acknowledgement Generated automatically, same as the importers.
const updateAckSchema = z.object({
  ackNumber: z.string().min(1),
  punchingDate: dateStringSchema.optional(),
});

export const updatePanAck = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const input = updateAckSchema.parse(req.body);
  const existing = await prisma.panApplication.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "PAN application not found");

  const [updated] = await prisma.$transaction([
    prisma.panApplication.update({
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
        action: "PAN_ACK_ENTERED",
        entityType: "pan_applications",
        entityId: id,
        meta: input,
      },
    }),
  ]);

  res.json(withAadhaarNumber(updated));
});

// Admin-only editable fields — deliberately excludes paymentMode/adjustedFromFormId/status/
// rejectionReason/ackNumber, which each have their own dedicated, transaction-guarded flow
// above rather than being safe to overwrite via a generic edit.
const baseEditPanShape = {
  applicationType: z.enum(["NEW", "CORRECTION"]),
  panNumber: z.string().length(10).optional(),
  applicantStatus: z.enum(["INDIVIDUAL", "NON_INDIVIDUAL"]),
  residencyStatus: z.enum(["RESIDENT", "NON_RESIDENT"]).default("RESIDENT"),
  applicantName: z.string().optional(),
  fatherName: z.string().optional(),
  dob: dateStringSchema.optional(),
  email: z.string().email().optional(),
  mobile: z.string().regex(/^\d{10}$/, "mobile must be a 10-digit number").optional(),
  aadhaarNumber: z.string().regex(/^\d{12}$/, "aadhaarNumber must be 12 digits").optional(),
  signedStatus: z.enum(["SIGNATURE", "THUMB"]),
  sourceType: z.enum(["OFFICE", "AGENT"]),
  agentId: z.number().int().optional(),
  feeAmount: z.number().nonnegative().optional(),
  formReceivedDate: dateStringSchema,
  punchingDate: dateStringSchema.optional(),
  notes: z.string().optional(),
};

function buildEditPanSchema(fieldReq: Record<string, boolean>) {
  return z.object(baseEditPanShape).superRefine((data, ctx) => {
    if (data.applicationType === "CORRECTION" && !data.panNumber) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["panNumber"], message: "panNumber is mandatory for a Correction/CSF application" });
    }
    requireField(ctx, Boolean(data.applicantName), "applicantName", fieldReq, "applicantName", "Applicant name");
    requireField(ctx, Boolean(data.dob), "dob", fieldReq, "dob", "Date of birth");
    requireField(ctx, Boolean(data.mobile), "mobile", fieldReq, "mobile", "Mobile number");
    requireField(ctx, data.feeAmount !== undefined, "feeAmount", fieldReq, "feeAmount", "Fees paid");
    // Aadhaar is intentionally NOT required here even for Individual: the API never returns
    // the plaintext number back to the client (only a masked preview), so an edit form can't
    // pre-fill it — leaving it blank on edit means "keep the existing value unchanged" below.
    if (data.applicantStatus === "INDIVIDUAL") {
      requireField(ctx, Boolean(data.fatherName), "fatherName", fieldReq, "fatherName", "Father's name");
    }
    if (data.sourceType === "AGENT" && !data.agentId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["agentId"], message: "agentId is mandatory when form source is Agent" });
    }
  });
}

export const updatePan = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const fieldReq = await getFieldRequirements("PAN");
  const input = buildEditPanSchema(fieldReq).parse(req.body);

  const existing = await prisma.panApplication.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "PAN application not found");

  const formReceivedDate = parseDdMmYyyy(input.formReceivedDate);
  const standardFeeAmount = await lookupStandardFee({
    module: "PAN",
    applicationType: input.applicationType,
    signedStatus: input.signedStatus,
    sourceType: input.sourceType,
    agentId: input.sourceType === "AGENT" ? input.agentId : null,
    asOf: formReceivedDate,
  });

  const [updated] = await prisma.$transaction([
    prisma.panApplication.update({
      where: { id },
      data: {
        applicationType: input.applicationType,
        existingPan: input.panNumber,
        applicantStatus: input.applicantStatus,
        residencyStatus: input.residencyStatus,
        applicantName: input.applicantName ?? "",
        fatherName: input.applicantStatus === "INDIVIDUAL" ? input.fatherName : null,
        dob: input.dob ? parseDdMmYyyy(input.dob) : null,
        email: input.email,
        mobile: input.mobile,
        // Left blank on edit -> undefined -> Prisma leaves the stored value untouched.
        aadhaarEncrypted: input.aadhaarNumber ? encryptAadhaar(input.aadhaarNumber) : undefined,
        aadhaarLast4: input.aadhaarNumber ? input.aadhaarNumber.slice(-4) : undefined,
        aadhaarHash: input.aadhaarNumber ? hashAadhaar(input.aadhaarNumber) : undefined,
        signedStatus: input.signedStatus,
        sourceType: input.sourceType,
        agentId: input.sourceType === "AGENT" ? input.agentId : null,
        feeAmount: input.feeAmount ?? 0,
        standardFeeAmount: standardFeeAmount ?? undefined,
        formReceivedDate,
        punchingDate: input.punchingDate ? parseDdMmYyyy(input.punchingDate) : undefined,
        notes: input.notes,
        // An agent's pre-submission draft is finalized the moment staff reviews and saves it —
        // no separate "approve" step. Stamp who actually did the office-side entry.
        ...(existing.status === "AGENT_DRAFT"
          ? { status: "UNDER_ENTRY" as const, createdById: req.user?.kind === "staff" ? req.user.id : undefined }
          : {}),
      },
      include: panInclude,
    }),
    prisma.auditLog.create({
      data: {
        actorId: req.user?.kind === "staff" ? req.user.id : null,
        action: "PAN_EDITED",
        entityType: "pan_applications",
        entityId: id,
        meta: { before: existing, after: input },
      },
    }),
  ]);

  res.json(withAadhaarNumber(updated));
});

export const deletePan = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    await prisma.panApplication.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2003" || err.code === "P2025")) {
      throw new ApiError(
        409,
        err.code === "P2025"
          ? "PAN application not found"
          : "This application is linked to another record (an adjustment or a dispatch entry) and cannot be deleted"
      );
    }
    throw err;
  }
  res.status(204).send();
});

const exportQuerySchema = listQuerySchema;

export const exportPan = asyncHandler(async (req: Request, res: Response) => {
  const format = req.query.format === "pdf" ? "pdf" : "xlsx";
  const filters = exportQuerySchema.parse(req.query);

  const applications = await prisma.panApplication.findMany({
    where: buildPanSearchWhere(filters),
    include: panInclude,
    orderBy: { createdAt: "desc" },
  });

  const columns: ExportColumn<(typeof applications)[number]>[] = [
    { header: "ID", value: (r) => String(r.id) },
    { header: "Applicant", value: (r) => r.applicantName },
    { header: "Status", value: (r) => r.applicantStatus },
    { header: "Residency", value: (r) => r.residencyStatus },
    { header: "Form Number", value: (r) => getPanFormNumber(r.applicationType, r.residencyStatus, r.applicantStatus) },
    { header: "Type", value: (r) => r.applicationType },
    { header: "Mobile", value: (r) => r.mobile ?? "" },
    { header: "Source", value: (r) => (r.sourceType === "AGENT" ? r.agent?.agentName ?? "Agent" : "Office") },
    { header: "Payment", value: (r) => r.paymentMode },
    { header: "Fee Paid", value: (r) => r.feeAmount.toString() },
    { header: "Standard Fee", value: (r) => r.standardFeeAmount?.toString() ?? "" },
    { header: "Form Status", value: (r) => r.status },
    { header: "Rejection Reason", value: (r) => r.rejectionReason ?? "" },
    { header: "Rejection Date", value: (r) => r.rejectionDate?.toISOString().slice(0, 10) ?? "" },
    { header: "Ack Number", value: (r) => r.ackNumber ?? "" },
    { header: "Punching Date", value: (r) => r.punchingDate?.toISOString().slice(0, 10) ?? "" },
    { header: "Form Received", value: (r) => r.formReceivedDate?.toISOString().slice(0, 10) ?? "" },
    { header: "Entry Date & Time", value: (r) => r.createdAt.toISOString() },
    { header: "Entered By", value: (r) => r.createdBy?.fullName ?? "" },
  ];

  if (format === "pdf") {
    exportPdf(res, "pan-applications", "PAN Applications", columns, applications);
  } else {
    await exportXlsx(res, "pan-applications", columns, applications);
  }
});

// The Form Source picked here is about where the OLD rejected form came from — independent
// of the new form's own source, since a credit earned via an agent can be adjusted into a
// walk-in resubmission or vice versa. Office lookups list every eligible rejected form and
// narrow with a free-text keyword (`q`) rather than requiring an exact mobile/name match.
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

  const where: Prisma.PanApplicationWhereInput =
    input.sourceType === "AGENT"
      ? { agentId: input.agentId, sourceType: "AGENT", status: "REJECTED", adjustmentAvailable: true }
      : { sourceType: "OFFICE", status: "REJECTED", adjustmentAvailable: true };

  if (input.q) {
    where.OR = [
      { applicantName: { contains: input.q, mode: "insensitive" } },
      { mobile: { contains: input.q } },
    ];
  }

  const candidates = await prisma.panApplication.findMany({
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

type MatchFieldKey = "aadhaar" | "name" | "mobile" | "dob";

/**
 * Bulk-matches a TIN-FC acknowledgement export against pending PAN applications and records
 * the ack number — this is how a form actually reaches ACK_GENERATED; nobody sets that status
 * by hand. Which Excel columns to read, and which combination of fields to match on (Aadhaar
 * alone can be ambiguous when one person has multiple applications on file), is configured via
 * AckImportMapping (see settings.controller.ts) rather than guessed at import time.
 */
export const importAckReport = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, "No file uploaded — attach the TIN-FC acknowledgement report as 'file'");
  }

  const mapping = await prisma.ackImportMapping.findUnique({ where: { module: "PAN" } });
  if (!mapping) {
    throw new ApiError(
      400,
      "No import column mapping is configured yet for PAN. Set it up under Settings → Acknowledgement Import first."
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

  const matchColumns: Array<{ key: MatchFieldKey; header: string; col: number }> = [];
  const configuredMatchHeaders: Array<[MatchFieldKey, string | null]> = [
    ["aadhaar", mapping.matchAadhaarHeader],
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
      "No match columns are configured. Set at least one (e.g. Aadhaar) under Settings → Acknowledgement Import."
    );
  }

  const results: Array<{
    row: number;
    outcome: "matched" | "skipped" | "unmatched" | "ambiguous";
    reason?: string;
    panApplicationId?: number;
    applicantName?: string;
    ackNumber?: string;
  }> = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const ackNumber = String(row.getCell(ackCol).value ?? "").trim();

    const where: Prisma.PanApplicationWhereInput = { status: "UNDER_ENTRY" };
    const matchedSummary: string[] = [];
    let rowHasAnyValue = Boolean(ackNumber);
    let invalidReason: string | null = null;

    for (const field of matchColumns) {
      const rawValue = row.getCell(field.col).value;

      if (field.key === "aadhaar") {
        const digits = String(rawValue ?? "").replace(/\D/g, "");
        if (!digits) {
          if (!invalidReason) invalidReason = "Missing Aadhaar number";
          continue;
        }
        rowHasAnyValue = true;
        if (!/^\d{12}$/.test(digits)) {
          invalidReason = "Invalid Aadhaar number (must be 12 digits)";
          continue;
        }
        where.aadhaarHash = hashAadhaar(digits);
        matchedSummary.push(`Aadhaar ...${digits.slice(-4)}`);
      } else if (field.key === "name") {
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
          if (!invalidReason) invalidReason = "Missing or invalid Date of Birth";
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

    const candidates = await prisma.panApplication.findMany({ where, orderBy: { createdAt: "desc" } });

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
      prisma.panApplication.update({
        where: { id: candidate.id },
        data: { status: "ACK_GENERATED", ackNumber },
      }),
      prisma.auditLog.create({
        data: {
          actorId: req.user?.kind === "staff" ? req.user.id : null,
          action: "PAN_ACK_IMPORTED",
          entityType: "pan_applications",
          entityId: candidate.id,
          meta: { ackNumber, sourceRow: rowNumber, sourceFile: req.file.originalname, matchedOn: matchedSummary },
        },
      }),
    ]);

    results.push({
      row: rowNumber,
      outcome: "matched",
      panApplicationId: candidate.id,
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
// Historical/ongoing Acknowledgement + Punching Date import — a fixed 5-column template
// (Ack Number, Name on Card, DOB, Mobile, Punching Date) for backfilling years of pre-system
// PAN history and, going forward, for routine batches straight from Protean. Unlike
// importAckReport above (which requires an admin-configured column mapping and only touches
// UNDER_ENTRY rows already on file), this: (1) matches by name plus whichever of
// mobile/DOB are available, trying the most specific combination first; (2) matches against
// every existing PAN row, not just pending ones; (3) when nothing matches, creates a new
// office walk-in record straight away rather than reporting "unmatched" — every other field
// is deliberately left blank/defaulted (see below) so historical data can be loaded now and
// completed later once the physical file is pulled.
// ---------------------------------------------------------------------------

const PAN_ACK_PUNCHING_HEADERS = [
  "Acknowledgement Number",
  "Name on Card",
  "Date of Birth",
  "Mobile",
  "Application Punching Date at Protean",
] as const;

export const downloadPanAckPunchingTemplate = asyncHandler(async (_req: Request, res: Response) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Ack + Punching Date");
  sheet.addRow(PAN_ACK_PUNCHING_HEADERS as unknown as string[]);
  sheet.addRow(["123456789012", "Ramesh Kumar", "15/06/1990", "9876543210", "20/03/2021"]);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="pan-ack-punching-template.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[b.length];
}

function normalizeNameForMatch(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
}

/** Office data entry and the Protean export routinely spell the same name slightly
 * differently (a dropped middle name, a typo, extra initials) — this returns 0..1 rather
 * than requiring an exact match. */
function nameSimilarity(a: string, b: string): number {
  const na = normalizeNameForMatch(a);
  const nb = normalizeNameForMatch(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 1 : 1 - levenshteinDistance(na, nb) / maxLen;
}

// A near-miss on spelling shouldn't block a match when the mobile/DOB already line up — but the
// name still has to be recognizably the same person, not just an unrelated shared number.
const NAME_SIMILARITY_THRESHOLD = 0.6;

/** Mobile is the strongest signal available (near-unique to one person), so it's tried first —
 * confirmed with a loose name-similarity check rather than an exact spelling match. DOB is the
 * fallback when a row has no mobile. Name alone is never enough to match — that falls through to
 * creating a new record instead. Returns whichever level first produced any candidates (so a
 * caller can tell a clean single match from an ambiguous one), or [] if none matched. */
async function findPanAckPunchingMatch(name: string, mobile: string | null, dob: Date | null) {
  if (mobile) {
    const byMobile = await prisma.panApplication.findMany({ where: { mobile } });
    let matches = byMobile.filter((r) => nameSimilarity(r.applicantName, name) >= NAME_SIMILARITY_THRESHOLD);
    // A shared/family mobile number occasionally matches more than one person by name
    // similarity alone — when the row also has a DOB, use it to narrow back down.
    if (matches.length > 1 && dob) {
      const narrowed = matches.filter((r) => r.dob && r.dob.getTime() === dob.getTime());
      if (narrowed.length > 0) matches = narrowed;
    }
    if (matches.length > 0) return matches;
  }
  if (dob) {
    const byDob = await prisma.panApplication.findMany({ where: { dob } });
    const matches = byDob.filter((r) => nameSimilarity(r.applicantName, name) >= NAME_SIMILARITY_THRESHOLD);
    if (matches.length > 0) return matches;
  }
  return [];
}

interface PanAckPunchingRowResult {
  row: number;
  outcome: "matched" | "created" | "ambiguous" | "conflict" | "skipped";
  reason?: string;
  panApplicationId?: number;
  /** Set instead of/alongside panApplicationId when more than one application is involved —
   * an ambiguous row's unresolved candidates, or a duplicate pair that both got updated. */
  candidateIds?: number[];
  applicantName?: string;
  ackNumber?: string;
}

export const importPanAckPunching = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(400, "No file uploaded — attach the import file as 'file'");
  const worksheet = await loadWorksheet(req.file);
  const headerRow = worksheet.getRow(1);

  const cols: Record<string, number | undefined> = {};
  for (const header of PAN_ACK_PUNCHING_HEADERS) {
    cols[header] = findColumnByHeader(headerRow, header);
  }
  const optionalHeaders = new Set(["Date of Birth", "Mobile", "Application Punching Date at Protean"]);
  const missing = PAN_ACK_PUNCHING_HEADERS.filter((h) => !optionalHeaders.has(h) && !cols[h]);
  if (missing.length) {
    throw new ApiError(400, `Missing required column(s) in row 1: ${missing.join(", ")}. Download the template for the exact expected headers.`);
  }

  const cell = (row: ExcelJS.Row, header: (typeof PAN_ACK_PUNCHING_HEADERS)[number]): string => {
    const col = cols[header];
    if (!col) return "";
    return String(row.getCell(col).value ?? "").trim();
  };
  const cellRaw = (row: ExcelJS.Row, header: (typeof PAN_ACK_PUNCHING_HEADERS)[number]): unknown => {
    const col = cols[header];
    return col ? row.getCell(col).value : undefined;
  };

  const results: PanAckPunchingRowResult[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const ackNumber = cell(row, "Acknowledgement Number");
    const name = cell(row, "Name on Card");
    if (!ackNumber && !name) continue; // fully blank row

    if (!ackNumber) {
      results.push({ row: rowNumber, outcome: "skipped", reason: "Missing Acknowledgement Number" });
      continue;
    }
    if (!name) {
      results.push({ row: rowNumber, outcome: "skipped", reason: "Missing Name on Card", ackNumber });
      continue;
    }

    const mobileRaw = cell(row, "Mobile").replace(/\D/g, "");
    const mobile = mobileRaw ? mobileRaw.slice(-10) : null;
    const dob = parseCellDate(cellRaw(row, "Date of Birth"));
    const punchingDate = parseCellDate(cellRaw(row, "Application Punching Date at Protean"));

    const candidates = await findPanAckPunchingMatch(name, mobile, dob);

    // Exactly 2 candidates is common enough (a rejected form followed by its resubmission, or a
    // genuine double entry) to resolve automatically rather than always punting to a human:
    //  - one REJECTED + one not -> the rejected one is old history; apply to the live one only.
    //  - any other 2-way combination (most often two UNDER_ENTRY rows for the same person) ->
    //    treat as the same real-world form entered twice and apply to both, rather than
    //    guessing which one to keep — nothing is deleted, so this is always safe to redo.
    // 3+ candidates is too ambiguous to guess at and always goes to manual review.
    let targets = candidates;
    if (candidates.length === 2) {
      const rejected = candidates.filter((c) => c.status === "REJECTED");
      const notRejected = candidates.filter((c) => c.status !== "REJECTED");
      if (rejected.length === 1 && notRejected.length === 1) {
        targets = notRejected;
      }
    }

    if (candidates.length > 2) {
      results.push({
        row: rowNumber,
        outcome: "ambiguous",
        reason: `${candidates.length} existing applications match this name/mobile/DOB combination — resolve manually`,
        candidateIds: candidates.map((c) => c.id),
        applicantName: name,
        ackNumber,
      });
      continue;
    }

    if (targets.length > 0) {
      const updatedIds: number[] = [];
      const conflictedIds: number[] = [];
      for (const existing of targets) {
        if (existing.ackNumber && existing.ackNumber !== ackNumber) {
          conflictedIds.push(existing.id);
          continue;
        }
        await prisma.panApplication.update({
          where: { id: existing.id },
          data: {
            ackNumber,
            punchingDate: punchingDate ?? undefined,
            status: existing.status === "UNDER_ENTRY" || existing.status === "PUSHED_TO_NSDL" ? "ACK_GENERATED" : undefined,
          },
        });
        updatedIds.push(existing.id);
      }

      if (updatedIds.length > 0) {
        results.push({
          row: rowNumber,
          outcome: "matched",
          panApplicationId: updatedIds[0],
          candidateIds: updatedIds.length > 1 ? updatedIds : undefined,
          reason:
            targets.length > 1
              ? `Applied to ${updatedIds.length} matching application(s) (${updatedIds.map((i) => `#${i}`).join(", ")})` +
                (conflictedIds.length ? `; ${conflictedIds.map((i) => `#${i}`).join(", ")} already had a different acknowledgement number and was left untouched` : "")
              : undefined,
          applicantName: name,
          ackNumber,
        });
      } else {
        results.push({
          row: rowNumber,
          outcome: "conflict",
          reason: `${conflictedIds.length > 1 ? "Both matching applications" : `PAN #${conflictedIds[0]}`} already ${conflictedIds.length > 1 ? "have" : "has"} a different acknowledgement number — not overwritten`,
          panApplicationId: conflictedIds[0],
          candidateIds: conflictedIds.length > 1 ? conflictedIds : undefined,
          applicantName: name,
          ackNumber,
        });
      }
      continue;
    }

    // No existing application matches — this is historical data that predates this system, or
    // simply hasn't been entered yet. Create a skeleton walk-in record now (every field this
    // report doesn't provide is left blank/defaulted) rather than blocking the load; the
    // missing formReceivedDate is what marks it as needing a proper follow-up entry later.
    const created = await prisma.panApplication.create({
      data: {
        applicationType: "NEW",
        applicantStatus: "INDIVIDUAL",
        residencyStatus: "RESIDENT",
        applicantName: name,
        dob: dob ?? undefined,
        mobile: mobile ?? undefined,
        signedStatus: "SIGNATURE",
        sourceType: "OFFICE",
        feeAmount: 0,
        paymentMode: "CASH",
        status: "ACK_GENERATED",
        ackNumber,
        punchingDate: punchingDate ?? undefined,
        notes: "Backfilled from historical acknowledgement/punching-date import — verify and complete remaining details.",
      },
    });
    results.push({ row: rowNumber, outcome: "created", panApplicationId: created.id, applicantName: name, ackNumber });
  }

  await logAudit(req, {
    action: "PAN_ACK_PUNCHING_IMPORTED",
    entityType: "pan_applications",
    entityId: 0,
    meta: { sourceFile: req.file.originalname, totalRows: results.length },
  });

  res.json({
    totalRows: results.length,
    matched: results.filter((r) => r.outcome === "matched").length,
    created: results.filter((r) => r.outcome === "created").length,
    ambiguous: results.filter((r) => r.outcome === "ambiguous").length,
    conflict: results.filter((r) => r.outcome === "conflict").length,
    skipped: results.filter((r) => r.outcome === "skipped").length,
    results,
  });
});

// ---------------------------------------------------------------------------
// Bulk create-from-Excel — a fixed column layout (unlike the admin-configurable
// acknowledgement mapping above), since this is creating new records rather than matching
// against existing ones. ADJUSTED payment mode isn't supported here — picking which rejected
// form to adjust against is an interactive lookup that doesn't translate to a bulk row.
// ---------------------------------------------------------------------------

const PAN_IMPORT_HEADERS = [
  "Application Type", "Status", "Residency Status", "Applicant Name", "Father's Name", "Date of Birth", "Mobile",
  "Email", "Aadhaar Number", "Signed Status", "Source", "Agent Name or Mobile", "Fees Paid",
  "Payment Mode", "Payment Detail", "Form Received Date", "Notes",
] as const;

export const downloadPanImportTemplate = asyncHandler(async (_req: Request, res: Response) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("PAN Import");
  sheet.addRow(PAN_IMPORT_HEADERS as unknown as string[]);
  sheet.addRow([
    "NEW", "INDIVIDUAL", "RESIDENT", "Ramesh Kumar", "Suresh Kumar", "15/06/1990", "9876543210",
    "", "123456789012", "SIGNATURE", "OFFICE", "", "150",
    "CASH", "", "11/09/2026", "",
  ]);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="pan-import-template.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

interface PanImportRowResult {
  row: number;
  outcome: "created" | "failed";
  reason?: string;
  panApplicationId?: number;
  applicantName?: string;
}

export const importPanBulk = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(400, "No file uploaded — attach the import file as 'file'");
  const worksheet = await loadWorksheet(req.file);
  const headerRow = worksheet.getRow(1);

  const cols: Record<string, number | undefined> = {};
  for (const header of PAN_IMPORT_HEADERS) {
    cols[header] = findColumnByHeader(headerRow, header);
  }
  const optionalHeaders = new Set(["Agent Name or Mobile", "Payment Detail", "Notes", "Father's Name", "Email", "Aadhaar Number", "Residency Status"]);
  const missing = PAN_IMPORT_HEADERS.filter((h) => !optionalHeaders.has(h) && !cols[h]);
  if (missing.length) {
    throw new ApiError(400, `Missing required column(s) in row 1: ${missing.join(", ")}. Download the template for the exact expected headers.`);
  }

  const fieldReq = await getFieldRequirements("PAN");
  const cell = (row: ExcelJS.Row, header: (typeof PAN_IMPORT_HEADERS)[number]): string => {
    const col = cols[header];
    if (!col) return "";
    return String(row.getCell(col).value ?? "").trim();
  };
  // Date cells must reach parseCellDate as the raw ExcelJS value (a Date instance when the
  // column is formatted as a date), not pre-stringified — stringifying a Date first turns it
  // into a JS Date.toString() dump ("Sun Mar 23 1997 ... GMT+0530") that no longer parses.
  const cellRaw = (row: ExcelJS.Row, header: (typeof PAN_IMPORT_HEADERS)[number]): unknown => {
    const col = cols[header];
    return col ? row.getCell(col).value : undefined;
  };

  const results: PanImportRowResult[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const applicantName = cell(row, "Applicant Name");
    if (!applicantName && !cell(row, "Mobile")) continue; // fully blank row

    try {
      const applicationType = cell(row, "Application Type").toUpperCase() || "NEW";
      if (applicationType !== "NEW" && applicationType !== "CORRECTION") {
        throw new Error(`Application Type must be NEW or CORRECTION, got "${applicationType}"`);
      }
      const applicantStatus = cell(row, "Status").toUpperCase() || "INDIVIDUAL";
      if (applicantStatus !== "INDIVIDUAL" && applicantStatus !== "NON_INDIVIDUAL") {
        throw new Error(`Status must be INDIVIDUAL or NON_INDIVIDUAL, got "${applicantStatus}"`);
      }
      const residencyStatus = cell(row, "Residency Status").toUpperCase() || "RESIDENT";
      if (residencyStatus !== "RESIDENT" && residencyStatus !== "NON_RESIDENT") {
        throw new Error(`Residency Status must be RESIDENT or NON_RESIDENT, got "${residencyStatus}"`);
      }
      const signedStatus = cell(row, "Signed Status").toUpperCase();
      if (signedStatus !== "SIGNATURE" && signedStatus !== "THUMB") {
        throw new Error(`Signed Status must be SIGNATURE or THUMB, got "${signedStatus}"`);
      }
      const sourceRaw = cell(row, "Source").toUpperCase() || "OFFICE";
      if (sourceRaw !== "OFFICE" && sourceRaw !== "AGENT") {
        throw new Error(`Source must be OFFICE or AGENT, got "${sourceRaw}"`);
      }
      const paymentModeRaw = cell(row, "Payment Mode").toUpperCase() || "CASH";
      if (paymentModeRaw !== "CASH" && paymentModeRaw !== "ONLINE" && paymentModeRaw !== "OTHER") {
        throw new Error(`Payment Mode must be CASH, ONLINE, or OTHER (ADJUSTED isn't supported via import), got "${paymentModeRaw}"`);
      }
      const paymentMode = paymentModeRaw;

      if (fieldReq.applicantName && !applicantName) throw new Error("Applicant Name is mandatory");
      const dobRaw = cell(row, "Date of Birth");
      if (fieldReq.dob && !dobRaw) throw new Error("Date of Birth is mandatory");
      const mobile = cell(row, "Mobile");
      if (fieldReq.mobile && !mobile) throw new Error("Mobile is mandatory");
      const aadhaarNumber = cell(row, "Aadhaar Number").replace(/\D/g, "");
      if (fieldReq.aadhaarNumber && applicantStatus === "INDIVIDUAL" && !aadhaarNumber) throw new Error("Aadhaar Number is mandatory");
      if (aadhaarNumber && !/^\d{12}$/.test(aadhaarNumber)) throw new Error("Aadhaar Number must be 12 digits");
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

      const dob = dobRaw ? parseCellDate(cellRaw(row, "Date of Birth")) : null;
      if (dobRaw && !dob) throw new Error(`Invalid Date of Birth "${dobRaw}" (expected DD/MM/YYYY)`);
      const formReceivedDate = parseCellDate(cellRaw(row, "Form Received Date"));
      if (!formReceivedDate) throw new Error(`Invalid Form Received Date "${formReceivedRaw}" (expected DD/MM/YYYY)`);

      const standardFeeAmount = await lookupStandardFee({
        module: "PAN",
        applicationType,
        signedStatus,
        sourceType: sourceRaw,
        agentId: sourceRaw === "AGENT" ? agentId : null,
        asOf: formReceivedDate,
      });

      const created = await prisma.panApplication.create({
        data: {
          applicationType,
          applicantStatus,
          residencyStatus,
          applicantName: applicantName || "",
          fatherName: applicantStatus === "INDIVIDUAL" ? cell(row, "Father's Name") || undefined : undefined,
          dob,
          email: cell(row, "Email") || undefined,
          mobile: mobile || undefined,
          aadhaarEncrypted: aadhaarNumber ? encryptAadhaar(aadhaarNumber) : undefined,
          aadhaarLast4: aadhaarNumber ? aadhaarNumber.slice(-4) : undefined,
          aadhaarHash: aadhaarNumber ? hashAadhaar(aadhaarNumber) : undefined,
          signedStatus,
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

      await logAudit(req, { action: "PAN_IMPORTED", entityType: "pan_applications", entityId: created.id, meta: { sourceRow: rowNumber, sourceFile: req.file.originalname } });
      results.push({ row: rowNumber, outcome: "created", panApplicationId: created.id, applicantName: created.applicantName });
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
