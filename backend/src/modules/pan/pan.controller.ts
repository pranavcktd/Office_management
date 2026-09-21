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
import { findColumnByHeader, findColumnByHeaderFragment, loadWorksheet, parseCellDate } from "../../utils/excelImport";
import { nameSimilarity, NAME_SIMILARITY_THRESHOLD } from "../../utils/nameMatch";
import { getProteanMapping } from "../../utils/proteanMapping";
import { compareDateField, compareNameField, compareTextField, recordDiscrepancies } from "../../utils/importDiscrepancy";
import type { FieldDiscrepancy } from "../../utils/importDiscrepancy";
import { getPanFormNumber } from "../../utils/formNumbers";
import { paginatedResponse, paginationQuerySchema, toSkipTake } from "../../utils/pagination";
import { localDateRange } from "../../utils/dateRange";
import { toUpper } from "../../utils/text";

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
  // Representative Assessee's (parent/guardian's) Aadhaar — mandatory only when the applicant
  // is a minor as of the form's date; see the age check in buildCreatePanSchema below.
  guardianAadhaarNumber: z.string().regex(/^\d{12}$/, "guardianAadhaarNumber must be 12 digits").optional(),
  signedStatus: z.enum(["SIGNATURE", "THUMB"]),
  sourceType: z.enum(["OFFICE", "AGENT"]),
  agentId: z.number().int().optional(),
  feeAmount: z.number().nonnegative().optional(),
  paymentMode: z.enum(["CASH", "ONLINE", "OTHER", "ADJUSTED"]),
  // Required whenever paymentMode is OTHER — "Other" is never a dead end in this app.
  paymentOtherDetail: z.string().min(1).optional(),
  // Required whenever paymentMode is ONLINE — who/what account was paid.
  onlinePaymentDetail: z.string().min(1).optional(),
  // Required whenever paymentMode is CASH — which staff member physically took the cash.
  cashReceivedById: z.number().int().optional(),
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

/** Age in whole years as of a given date — used to flag a minor applicant, whose form needs the
 * representative assessee's (parent/guardian's) Aadhaar rather than (or alongside) their own. */
function calculateAgeYears(dob: Date, asOf: Date): number {
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = asOf.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getUTCDate() < dob.getUTCDate())) {
    age--;
  }
  return age;
}

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
    // Adjusted against a rejected form's fee credit — no fresh payment is necessarily taken, so
    // fees paid is never mandatory here regardless of the admin-configured requirement.
    if (data.paymentMode !== "ADJUSTED") {
      requireField(ctx, data.feeAmount !== undefined, "feeAmount", fieldReq, "feeAmount", "Fees paid");
    }
    if (data.applicantStatus === "INDIVIDUAL") {
      requireField(ctx, Boolean(data.fatherName), "fatherName", fieldReq, "fatherName", "Father's name");
      requireField(ctx, Boolean(data.aadhaarNumber), "aadhaarNumber", fieldReq, "aadhaarNumber", "Aadhaar number");
      // A minor as of the form's own date needs the representative assessee's (parent/
      // guardian's) Aadhaar on file too — always mandatory in that case, regardless of the
      // admin-configured field requirements (which govern the applicant's own fields only).
      if (data.dob) {
        const age = calculateAgeYears(parseDdMmYyyy(data.dob), parseDdMmYyyy(data.formReceivedDate));
        if (age < 18 && !data.guardianAadhaarNumber) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["guardianAadhaarNumber"],
            message: "Applicant is a minor as of the form date — the representative assessee's (parent/guardian's) Aadhaar number is mandatory",
          });
        }
      }
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
    if (data.paymentMode === "CASH" && !data.cashReceivedById) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cashReceivedById"], message: "cashReceivedById is mandatory when payment mode is Cash" });
    }
  });
}

export const createPan = asyncHandler(async (req: Request, res: Response) => {
  const fieldReq = await getFieldRequirements("PAN");
  const input = buildCreatePanSchema(fieldReq).parse(req.body);
  const formReceivedDate = parseDdMmYyyy(input.formReceivedDate);

  // Adjusted against a rejected form's fee credit — the normal fee schedule doesn't apply, and
  // whether a nominal "adjusting fee" gets collected on top of the credit varies agent by agent
  // by informal arrangement. Whatever was actually collected (zero, or that nominal amount) IS
  // the correct figure for this row, so pin standardFeeAmount to match it exactly — the ledger
  // must never show an adjusted form as owing or overpaid.
  const standardFeeAmount =
    input.paymentMode === "ADJUSTED"
      ? input.feeAmount ?? 0
      : await lookupStandardFee({
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
        existingPan: toUpper(input.panNumber),
        applicantName: toUpper(input.applicantName) ?? "",
        fatherName: input.applicantStatus === "INDIVIDUAL" ? toUpper(input.fatherName) : undefined,
        dob: input.dob ? parseDdMmYyyy(input.dob) : null,
        email: toUpper(input.email),
        mobile: input.mobile,
        aadhaarEncrypted: input.aadhaarNumber ? encryptAadhaar(input.aadhaarNumber) : undefined,
        aadhaarLast4: input.aadhaarNumber ? input.aadhaarNumber.slice(-4) : undefined,
        aadhaarHash: input.aadhaarNumber ? hashAadhaar(input.aadhaarNumber) : undefined,
        guardianAadhaarEncrypted: input.guardianAadhaarNumber ? encryptAadhaar(input.guardianAadhaarNumber) : undefined,
        guardianAadhaarLast4: input.guardianAadhaarNumber ? input.guardianAadhaarNumber.slice(-4) : undefined,
        signedStatus: input.signedStatus,
        sourceType: input.sourceType,
        agentId: input.sourceType === "AGENT" ? input.agentId : undefined,
        feeAmount: input.feeAmount ?? 0,
        standardFeeAmount: standardFeeAmount ?? undefined,
        paymentMode: input.paymentMode,
        paymentOtherDetail: input.paymentMode === "OTHER" ? toUpper(input.paymentOtherDetail) : undefined,
        onlinePaymentDetail: input.paymentMode === "ONLINE" ? toUpper(input.onlinePaymentDetail) : undefined,
        cashReceivedById: input.paymentMode === "CASH" ? input.cashReceivedById : undefined,
        adjustedFromFormId: input.paymentMode === "ADJUSTED" ? input.adjustedFromFormId : undefined,
        formReceivedDate,
        punchingDate: input.punchingDate ? parseDdMmYyyy(input.punchingDate) : undefined,
        notes: toUpper(input.notes),
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
      existingPan: toUpper(input.panNumber),
      applicantName: toUpper(input.applicantName) ?? "",
      fatherName: input.applicantStatus !== "NON_INDIVIDUAL" ? toUpper(input.fatherName) : undefined,
      dob: input.dob ? parseDdMmYyyy(input.dob) : null,
      email: toUpper(input.email),
      mobile: input.mobile,
      aadhaarEncrypted: input.aadhaarNumber ? encryptAadhaar(input.aadhaarNumber) : undefined,
      aadhaarLast4: input.aadhaarNumber ? input.aadhaarNumber.slice(-4) : undefined,
      aadhaarHash: input.aadhaarNumber ? hashAadhaar(input.aadhaarNumber) : undefined,
      signedStatus: input.signedStatus ?? "SIGNATURE",
      sourceType: "AGENT",
      agentId: req.user.id,
      paymentMode: "CASH",
      status: "AGENT_DRAFT",
      notes: toUpper(input.notes),
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
      existingPan: toUpper(input.panNumber),
      applicantName: toUpper(input.applicantName) ?? "",
      fatherName: (input.applicantStatus ?? existing.applicantStatus) !== "NON_INDIVIDUAL" ? toUpper(input.fatherName) : null,
      dob: input.dob ? parseDdMmYyyy(input.dob) : null,
      email: toUpper(input.email),
      mobile: input.mobile,
      aadhaarEncrypted: input.aadhaarNumber ? encryptAadhaar(input.aadhaarNumber) : null,
      aadhaarLast4: input.aadhaarNumber ? input.aadhaarNumber.slice(-4) : null,
      aadhaarHash: input.aadhaarNumber ? hashAadhaar(input.aadhaarNumber) : null,
      signedStatus: input.signedStatus ?? existing.signedStatus,
      notes: toUpper(input.notes),
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
  // Which staff member physically received the cash — lets admin pull "cash collected by X"
  // for daily cash-accountability reporting.
  cashReceivedById: z.coerce.number().int().optional(),
  // Rows the Protean import auto-created because no matching entry existed in the system at
  // all — "staff punched this without entering it here first." See attendance report/dashboard.
  // z.coerce.boolean() would treat the string "false" as truthy, so enum+transform instead.
  autoBackfilled: z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? undefined : v === "true")),
  rejectionReason: z.enum(["ALREADY_ISSUED", "DEMOGRAPHIC_FAILED", "DATA_INCOMPLETE", "SIGNATURE_PHOTO_MISMATCH", "OTHER"]).optional(),
  // Only meaningful for REJECTED forms — mirrors the 3-state credit logic used in Reports and
  // the agent portal (Available / Time Barred / Used).
  creditStatus: z.enum(["AVAILABLE", "TIME_BARRED", "USED"]).optional(),
  // Filters on createdAt (entry date/time) — plain YYYY-MM-DD boundaries from a native date
  // input, interpreted as local calendar days (see utils/dateRange.ts), not the DD/MM/YYYY
  // used for actually-entered data elsewhere in this app.
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().optional(),
}).merge(paginationQuerySchema);

function buildPanSearchWhere(filters: {
  status?: "AGENT_DRAFT" | "UNDER_ENTRY" | "PUSHED_TO_NSDL" | "ACK_GENERATED" | "REJECTED";
  sourceType?: "OFFICE" | "AGENT";
  agentId?: number;
  cashReceivedById?: number;
  autoBackfilled?: boolean;
  rejectionReason?: "ALREADY_ISSUED" | "DEMOGRAPHIC_FAILED" | "DATA_INCOMPLETE" | "SIGNATURE_PHOTO_MISMATCH" | "OTHER";
  creditStatus?: "AVAILABLE" | "TIME_BARRED" | "USED";
  from?: string;
  to?: string;
  q?: string;
  // Present when callers pass a listQuerySchema-parsed object straight through — never valid
  // Prisma where-clause keys, so always stripped here rather than trusted to be absent.
  page?: number;
  pageSize?: number;
}): Prisma.PanApplicationWhereInput {
  const { q, from, to, creditStatus, page: _page, pageSize: _pageSize, ...rest } = filters;
  const creditWhere: Prisma.PanApplicationWhereInput =
    creditStatus === "AVAILABLE"
      ? { status: "REJECTED", adjustmentAvailable: true }
      : creditStatus === "TIME_BARRED"
        ? { status: "REJECTED", adjustmentAvailable: false, adjustmentExpiredAt: { not: null } }
        : creditStatus === "USED"
          ? { status: "REJECTED", adjustmentAvailable: false, adjustedTo: { isNot: null } }
          : {};
  const createdAtRange = localDateRange(from, to);
  return {
    ...rest,
    ...creditWhere,
    ...(createdAtRange ? { createdAt: createdAtRange } : {}),
    ...(q ? { OR: panSearchClauses(q) } : {}),
    // A historical-backfill row was never a live application staff skipped entering — exclude it
    // from the "Missing Entry Alert" filter regardless of autoBackfilled, same as the dashboard
    // stat (see dailyActivity.ts).
    ...(rest.autoBackfilled === true ? { historicalImport: false } : {}),
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
  cashReceivedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.PanApplicationInclude;

export const listPan = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, ...filters } = listQuerySchema.parse(req.query);
  const where = buildPanSearchWhere(filters);
  const [applications, total, feeAgg] = await Promise.all([
    prisma.panApplication.findMany({
      where,
      include: panInclude,
      orderBy: { createdAt: "desc" },
      ...toSkipTake(page, pageSize),
    }),
    prisma.panApplication.count({ where }),
    prisma.panApplication.aggregate({ where, _sum: { feeAmount: true } }),
  ]);
  res.json(
    paginatedResponse(applications.map(withAadhaarNumber), total, page, pageSize, Number(feeAgg._sum.feeAmount ?? 0))
  );
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
  T extends {
    aadhaarEncrypted?: string | null;
    aadhaarLast4?: string | null;
    aadhaarHash?: string | null;
    guardianAadhaarEncrypted?: string | null;
    guardianAadhaarLast4?: string | null;
  }
>(application: T) {
  const { aadhaarEncrypted, aadhaarHash, guardianAadhaarEncrypted, ...rest } = application;
  return {
    ...rest,
    aadhaarNumber: aadhaarEncrypted ? decryptAadhaar(aadhaarEncrypted) : null,
    guardianAadhaarNumber: guardianAadhaarEncrypted ? decryptAadhaar(guardianAadhaarEncrypted) : null,
  };
}

// Staff only ever choose between these two manually: pushing to Protean isn't a tracked
// step, and Ack Generated is set automatically by the ack+punching or Protean punching
// report import below — not something typed in by hand.
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

  const existing = await prisma.panApplication.findUnique({ where: { id }, select: { status: true, formReceivedDate: true } });
  if (!existing) throw new ApiError(404, "PAN application not found");
  // Once a form has moved past Under Entry — an ack was recorded, or it was already
  // rejected — changing its status again (including rejecting one that already has an ack,
  // entered by mistake) is an admin-only correction, not routine staff data entry.
  if (existing.status !== "UNDER_ENTRY" && req.user?.role !== "ADMIN") {
    throw new ApiError(403, "Only an admin can change the status of a form that already has an acknowledgement or was already rejected.");
  }
  // A form can't be rejected before it was even received from the client.
  if (input.status === "REJECTED" && existing.formReceivedDate) {
    const rejectionDate = parseDdMmYyyy(input.rejectionDate!);
    if (rejectionDate < existing.formReceivedDate) {
      throw new ApiError(400, "Rejection date cannot be before the form received date");
    }
  }

  const [updated] = await prisma.$transaction([
    prisma.panApplication.update({
      where: { id },
      data: {
        status: input.status,
        rejectionReason: input.status === "REJECTED" ? input.rejectionReason : null,
        rejectionOtherDetail:
          input.status === "REJECTED" && input.rejectionReason === "OTHER" ? toUpper(input.rejectionOtherDetail) : null,
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
  // First-time entry (nothing on file yet) is routine staff data entry; correcting an ack
  // number that's already recorded is an admin-only fix.
  if (existing.ackNumber && req.user?.role !== "ADMIN") {
    throw new ApiError(403, "Only an admin can correct an acknowledgement number that's already on file.");
  }

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
  guardianAadhaarNumber: z.string().regex(/^\d{12}$/, "guardianAadhaarNumber must be 12 digits").optional(),
  signedStatus: z.enum(["SIGNATURE", "THUMB"]),
  sourceType: z.enum(["OFFICE", "AGENT"]),
  agentId: z.number().int().optional(),
  feeAmount: z.number().nonnegative().optional(),
  formReceivedDate: dateStringSchema,
  punchingDate: dateStringSchema.optional(),
  notes: z.string().optional(),
};

function buildEditPanSchema(fieldReq: Record<string, boolean>, isAdjusted: boolean) {
  return z.object(baseEditPanShape).superRefine((data, ctx) => {
    if (data.applicationType === "CORRECTION" && !data.panNumber) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["panNumber"], message: "panNumber is mandatory for a Correction/CSF application" });
    }
    requireField(ctx, Boolean(data.applicantName), "applicantName", fieldReq, "applicantName", "Applicant name");
    requireField(ctx, Boolean(data.dob), "dob", fieldReq, "dob", "Date of birth");
    requireField(ctx, Boolean(data.mobile), "mobile", fieldReq, "mobile", "Mobile number");
    // paymentMode itself isn't editable (see below), so an existing ADJUSTED form's fee credit
    // basis never requires a fresh fees-paid figure, same as at creation time.
    if (!isAdjusted) {
      requireField(ctx, data.feeAmount !== undefined, "feeAmount", fieldReq, "feeAmount", "Fees paid");
    }
    // Aadhaar (applicant's and guardian's) is intentionally NOT required here even for
    // Individual/minor: the API never returns the plaintext number back to the client (only a
    // masked preview), so an edit form can't pre-fill it — leaving it blank on edit means "keep
    // the existing value unchanged" below.
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
  const existing = await prisma.panApplication.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "PAN application not found");

  const fieldReq = await getFieldRequirements("PAN");
  const input = buildEditPanSchema(fieldReq, existing.paymentMode === "ADJUSTED").parse(req.body);

  const formReceivedDate = parseDdMmYyyy(input.formReceivedDate);
  // See createPan's identical comment: an adjusted form's standardFeeAmount always mirrors
  // whatever was actually collected, never the fee-schedule lookup — paymentMode itself isn't
  // editable, so this reflects the existing record's mode.
  const standardFeeAmount =
    existing.paymentMode === "ADJUSTED"
      ? input.feeAmount ?? 0
      : await lookupStandardFee({
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
        existingPan: toUpper(input.panNumber),
        applicantStatus: input.applicantStatus,
        residencyStatus: input.residencyStatus,
        applicantName: toUpper(input.applicantName) ?? "",
        fatherName: input.applicantStatus === "INDIVIDUAL" ? toUpper(input.fatherName) : null,
        dob: input.dob ? parseDdMmYyyy(input.dob) : null,
        email: toUpper(input.email),
        mobile: input.mobile,
        // Left blank on edit -> undefined -> Prisma leaves the stored value untouched.
        aadhaarEncrypted: input.aadhaarNumber ? encryptAadhaar(input.aadhaarNumber) : undefined,
        aadhaarLast4: input.aadhaarNumber ? input.aadhaarNumber.slice(-4) : undefined,
        aadhaarHash: input.aadhaarNumber ? hashAadhaar(input.aadhaarNumber) : undefined,
        guardianAadhaarEncrypted: input.guardianAadhaarNumber ? encryptAadhaar(input.guardianAadhaarNumber) : undefined,
        guardianAadhaarLast4: input.guardianAadhaarNumber ? input.guardianAadhaarNumber.slice(-4) : undefined,
        signedStatus: input.signedStatus,
        sourceType: input.sourceType,
        agentId: input.sourceType === "AGENT" ? input.agentId : null,
        feeAmount: input.feeAmount ?? 0,
        standardFeeAmount: standardFeeAmount ?? undefined,
        formReceivedDate,
        punchingDate: input.punchingDate ? parseDdMmYyyy(input.punchingDate) : undefined,
        notes: toUpper(input.notes),
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
    {
      header: "Paid To / Payment Detail",
      value: (r) =>
        r.paymentMode === "ONLINE"
          ? r.onlinePaymentDetail ?? ""
          : r.paymentMode === "OTHER"
            ? r.paymentOtherDetail ?? ""
            : r.paymentMode === "CASH"
              ? r.cashReceivedBy?.fullName ?? ""
              : "",
    },
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
    { header: "Notes", value: (r) => r.notes ?? "" },
  ];

  const totalFee = applications.reduce((sum, r) => sum + Number(r.feeAmount), 0);
  const summaryLines = [`Total Fee Collected: ₹${totalFee.toFixed(2)}`];

  if (format === "pdf") {
    exportPdf(res, "pan-applications", "PAN Applications", columns, applications, summaryLines);
  } else {
    await exportXlsx(res, "pan-applications", columns, applications, summaryLines);
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

// ---------------------------------------------------------------------------
// Historical/ongoing Acknowledgement + Punching Date import — a fixed 5-column template
// (Ack Number, Name on Card, DOB, Mobile, Punching Date) for backfilling years of pre-system
// PAN history and, going forward, for routine batches straight from Protean. This: (1) matches
// by name plus whichever of mobile/DOB are available, trying the most specific combination
// first; (2) matches against
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
  "Email",
  "Father's Name",
] as const;

export const downloadPanAckPunchingTemplate = asyncHandler(async (_req: Request, res: Response) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Ack + Punching Date");
  sheet.addRow(PAN_ACK_PUNCHING_HEADERS as unknown as string[]);
  sheet.addRow(["123456789012", "Ramesh Kumar", "15/06/1990", "9876543210", "20/03/2021", "ramesh@example.com", "Suresh Kumar"]);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="pan-ack-punching-template.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

interface PanAckPunchingMatchResult {
  candidates: Awaited<ReturnType<typeof prisma.panApplication.findMany>>;
  /** "mobile" means the match is corroborated by an exact mobile number match (a near-unique
   * signal) — safe to auto-apply. "dob" means mobile wasn't available on this row at all, so the
   * match rests purely on name-similarity + DOB, both of which can coincidentally line up for two
   * different people (e.g. two "Devi"/"Kumar"-surname relatives sharing a DOB) — never auto-apply
   * this, always route to ambiguous for a human to confirm, regardless of candidate count. */
  matchedVia: "mobile" | "dob" | null;
}

/** Mobile is the strongest signal available (near-unique to one person), so it's tried first —
 * confirmed with a loose name-similarity check rather than an exact spelling match. DOB is the
 * fallback when a row has no mobile, but is intentionally never treated as confident enough to
 * auto-apply on its own — see matchedVia above. Name alone is never enough to match — that falls
 * through to creating a new record instead. */
async function findPanAckPunchingMatch(name: string, mobile: string | null, dob: Date | null): Promise<PanAckPunchingMatchResult> {
  if (mobile) {
    const byMobile = await prisma.panApplication.findMany({ where: { mobile } });
    let matches = byMobile.filter((r) => nameSimilarity(r.applicantName, name) >= NAME_SIMILARITY_THRESHOLD);
    // A shared/family mobile number occasionally matches more than one person by name
    // similarity alone — when the row also has a DOB, use it to narrow back down.
    if (matches.length > 1 && dob) {
      const narrowed = matches.filter((r) => r.dob && r.dob.getTime() === dob.getTime());
      if (narrowed.length > 0) matches = narrowed;
    }
    if (matches.length > 0) return { candidates: matches, matchedVia: "mobile" };
  }
  if (dob) {
    const byDob = await prisma.panApplication.findMany({ where: { dob } });
    const matches = byDob.filter((r) => nameSimilarity(r.applicantName, name) >= NAME_SIMILARITY_THRESHOLD);
    if (matches.length > 0) return { candidates: matches, matchedVia: "dob" };
  }
  return { candidates: [], matchedVia: null };
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
  /** Exactly what this row's cells were read as, regardless of outcome — lets the preview (and
   * the final result) show whether a column like "Father's Name" was actually recognized and
   * had a value, without needing to inspect the database. */
  parsedRow?: {
    dob: string | null;
    mobile: string | null;
    email: string | null;
    fatherName: string | null;
    punchingDate: string | null;
  };
  /** Set on a "matched" row when the office's on-file data disagrees with what this report says
   * for one or more fields — e.g. a typo'd name or a wrong mobile digit caught at data entry.
   * The match/update still goes ahead; this only flags the disagreement for admin review (see
   * utils/importDiscrepancy.ts and the Reports → Data Entry Accuracy tab). */
  discrepancies?: FieldDiscrepancy[];
}

interface PanAckPunchingImportSummary {
  dryRun: boolean;
  historicalImport: boolean;
  detectedColumns: Record<string, boolean>;
  totalRows: number;
  matched: number;
  created: number;
  ambiguous: number;
  conflict: number;
  skipped: number;
  results: PanAckPunchingRowResult[];
}

/** Shared by the real import and its preview — parses and matches identically either way;
 * dryRun just skips the two database writes (update/create) so nothing is saved.
 * historicalImport marks every newly-created row as predating this system entirely (a genuine
 * backfill of old paper records) rather than a live application staff forgot to enter — see
 * PanApplication.historicalImport — so it's excluded from every "missing entry" alert. */
async function runPanAckPunchingImport(file: Express.Multer.File, dryRun: boolean, historicalImport: boolean): Promise<PanAckPunchingImportSummary> {
  const worksheet = await loadWorksheet(file);
  const headerRow = worksheet.getRow(1);

  const cols: Record<string, number | undefined> = {};
  for (const header of PAN_ACK_PUNCHING_HEADERS) {
    cols[header] = findColumnByHeader(headerRow, header);
  }
  const detectedColumns: Record<string, boolean> = {};
  for (const header of PAN_ACK_PUNCHING_HEADERS) {
    detectedColumns[header] = Boolean(cols[header]);
  }
  const optionalHeaders = new Set(["Date of Birth", "Mobile", "Application Punching Date at Protean", "Email", "Father's Name"]);
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
    const name = toUpper(cell(row, "Name on Card"));
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
    const email = toUpper(cell(row, "Email") || null);
    const fatherName = toUpper(cell(row, "Father's Name") || null);
    const parsedRow = {
      dob: dob ? dob.toISOString().slice(0, 10) : null,
      mobile,
      email,
      fatherName,
      punchingDate: punchingDate ? punchingDate.toISOString().slice(0, 10) : null,
    };

    // Shared by the no-match path below and, for a historical-backfill batch only, the
    // ack-number-conflict path — see its call site's comment for why.
    const createSkeleton = async (): Promise<number | undefined> => {
      if (dryRun) return undefined;
      const created = await prisma.panApplication.create({
        data: {
          applicationType: "NEW",
          applicantStatus: "INDIVIDUAL",
          residencyStatus: "RESIDENT",
          applicantName: name,
          dob: dob ?? undefined,
          mobile: mobile ?? undefined,
          email: email ?? undefined,
          fatherName: fatherName ?? undefined,
          signedStatus: "SIGNATURE",
          sourceType: "OFFICE",
          feeAmount: 0,
          paymentMode: "CASH",
          status: "ACK_GENERATED",
          ackNumber,
          punchingDate: punchingDate ?? undefined,
          notes: "Backfilled from historical acknowledgement/punching-date import — verify and complete remaining details.",
          autoBackfilled: true,
          historicalImport,
        },
      });
      return created.id;
    };

    const { candidates, matchedVia } = await findPanAckPunchingMatch(name, mobile, dob);

    // A match resting on name+DOB alone (no mobile on this row to corroborate it) is never
    // confident enough to auto-apply to the existing candidate(s) — a shared DOB plus two
    // similarly-spelled names (e.g. two different "___ Devi"/"___ Kumar" relatives) can
    // coincidentally pass the name-similarity check. The candidate(s) are never touched either
    // way; the only question is whether this row gets created as its own record or left for
    // manual review. For a historical backfill, same as an ack-number conflict, create it
    // straight away — worst case is a harmless duplicate person record, not a corrupted one,
    // since nothing here ever gets written into the existing candidate.
    if (matchedVia === "dob" && candidates.length > 0) {
      if (historicalImport) {
        const createdId = await createSkeleton();
        results.push({
          row: rowNumber,
          outcome: "created",
          panApplicationId: createdId,
          reason: `Matched ${candidates.length === 1 ? `application #${candidates[0].id} (${candidates[0].applicantName})` : `${candidates.length} existing applications`} by name + date of birth only (no mobile to corroborate) — created as a separate historical record rather than guessing.`,
          candidateIds: candidates.map((c) => c.id),
          applicantName: name,
          ackNumber,
          parsedRow,
        });
      } else {
        results.push({
          row: rowNumber,
          outcome: "ambiguous",
          reason:
            candidates.length === 1
              ? `Matched application #${candidates[0].id} (${candidates[0].applicantName}) by name + date of birth only — this row has no mobile number to corroborate it, so it's not applied automatically. Confirm it's the same person before updating.`
              : `${candidates.length} existing applications match by name + date of birth only (no mobile on this row to narrow further) — resolve manually.`,
          candidateIds: candidates.map((c) => c.id),
          applicantName: name,
          ackNumber,
          parsedRow,
        });
      }
      continue;
    }

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
      if (historicalImport) {
        const createdId = await createSkeleton();
        results.push({
          row: rowNumber,
          outcome: "created",
          panApplicationId: createdId,
          reason: `${candidates.length} existing applications match this name/mobile/DOB combination — too many to guess between, so created as a separate historical record rather than picking one.`,
          candidateIds: candidates.map((c) => c.id),
          applicantName: name,
          ackNumber,
          parsedRow,
        });
      } else {
        results.push({
          row: rowNumber,
          outcome: "ambiguous",
          reason: `${candidates.length} existing applications match this name/mobile/DOB combination — resolve manually`,
          candidateIds: candidates.map((c) => c.id),
          applicantName: name,
          ackNumber,
          parsedRow,
        });
      }
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
        if (!dryRun) {
          await prisma.panApplication.update({
            where: { id: existing.id },
            data: {
              ackNumber,
              punchingDate: punchingDate ?? undefined,
              status: existing.status === "UNDER_ENTRY" || existing.status === "PUSHED_TO_NSDL" ? "ACK_GENERATED" : undefined,
              // Fill a gap, never overwrite — a value already on file (typed in directly, or from
              // an earlier import) is left exactly as it is, even if this row disagrees with it.
              email: !existing.email && email ? email : undefined,
              fatherName: !existing.fatherName && fatherName ? fatherName : undefined,
            },
          });
        }
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
          parsedRow,
        });
      } else if (historicalImport) {
        // For a historical backfill, a same-person-different-ack-number "conflict" is expected —
        // it usually just means the same applicant appears more than once across the years (a
        // correction, a fresh application, etc.), not a data-entry mistake to review. Create it
        // as its own separate record straight away instead of blocking on manual review; the
        // existing application(s) it collided with are left completely untouched either way.
        const createdId = await createSkeleton();
        results.push({
          row: rowNumber,
          outcome: "created",
          panApplicationId: createdId,
          reason: `${conflictedIds.length > 1 ? "Existing matching applications already had" : `PAN #${conflictedIds[0]} already had`} a different acknowledgement number on file — created as a separate historical record instead of overwriting.`,
          candidateIds: conflictedIds.length > 0 ? conflictedIds : undefined,
          applicantName: name,
          ackNumber,
          parsedRow,
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
          parsedRow,
        });
      }
      continue;
    }

    // No existing application matches — this is historical data that predates this system, or
    // simply hasn't been entered yet. Create a skeleton walk-in record now (every field this
    // report doesn't provide is left blank/defaulted) rather than blocking the load; the
    // missing formReceivedDate is what marks it as needing a proper follow-up entry later.
    const createdId = await createSkeleton();
    results.push({ row: rowNumber, outcome: "created", panApplicationId: createdId, applicantName: name, ackNumber, parsedRow });
  }

  return {
    dryRun,
    historicalImport,
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

const createConflictRowSchema = z.object({
  applicantName: z.string().min(1),
  ackNumber: z.string().min(1),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  mobile: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  fatherName: z.string().nullable().optional(),
  punchingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  historicalImport: z.boolean().optional().default(false),
});

/** A "conflict" row from the ack+punching importer means an existing application matched by
 * name/mobile/DOB but already has a *different* ack number on file — the importer never guesses
 * whether that's a data-entry typo or a genuine second/correction application by the same person,
 * so it leaves both untouched. This lets an admin who has actually checked it's the latter
 * deliberately create it as its own new record, from the same parsed row data the import already
 * read, instead of retyping everything into the regular New PAN form. */
export const createPanFromConflictRow = asyncHandler(async (req: Request, res: Response) => {
  const input = createConflictRowSchema.parse(req.body);

  const existingWithAck = await prisma.panApplication.findFirst({ where: { ackNumber: input.ackNumber } });
  if (existingWithAck) {
    throw new ApiError(409, `An application with acknowledgement number ${input.ackNumber} already exists (#${existingWithAck.id}) — nothing created.`);
  }

  const dob = input.dob ? new Date(`${input.dob}T00:00:00.000Z`) : undefined;
  const punchingDate = input.punchingDate ? new Date(`${input.punchingDate}T00:00:00.000Z`) : undefined;

  const created = await prisma.panApplication.create({
    data: {
      applicationType: "NEW",
      applicantStatus: "INDIVIDUAL",
      residencyStatus: "RESIDENT",
      applicantName: toUpper(input.applicantName),
      dob,
      mobile: input.mobile ?? undefined,
      email: toUpper(input.email) ?? undefined,
      fatherName: toUpper(input.fatherName) ?? undefined,
      signedStatus: "SIGNATURE",
      sourceType: "OFFICE",
      feeAmount: 0,
      paymentMode: "CASH",
      status: "ACK_GENERATED",
      ackNumber: input.ackNumber,
      punchingDate,
      notes: "Created manually from an ack+punching import 'conflict' row — admin confirmed this is a genuine separate/correction application, not a data-entry mistake on the existing match.",
      autoBackfilled: true,
      historicalImport: input.historicalImport,
    },
  });

  await logAudit(req, {
    action: "PAN_CREATED_FROM_IMPORT_CONFLICT",
    entityType: "pan_applications",
    entityId: created.id,
    meta: { ackNumber: input.ackNumber, applicantName: input.applicantName },
  });

  res.status(201).json({ id: created.id });
});

export const importPanAckPunching = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(400, "No file uploaded — attach the import file as 'file'");
  const historicalImport = req.body?.historicalImport === "true";
  const summary = await runPanAckPunchingImport(req.file, false, historicalImport);

  await logAudit(req, {
    action: "PAN_ACK_PUNCHING_IMPORTED",
    entityType: "pan_applications",
    entityId: 0,
    meta: { sourceFile: req.file.originalname, totalRows: summary.totalRows, historicalImport },
  });

  res.json(summary);
});

/** Read-only dry run of the exact same parsing + matching logic, with the database untouched —
 * lets the admin see what would happen (and inspect precisely how each column was read, e.g.
 * to catch a header that failed to match) before committing to the real import. */
export const previewPanAckPunching = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(400, "No file uploaded — attach the import file as 'file'");
  const historicalImport = req.body?.historicalImport === "true";
  const summary = await runPanAckPunchingImport(req.file, true, historicalImport);
  res.json(summary);
});

// ---------------------------------------------------------------------------
// Protean's own "punching status" report — a fixed export format from their portal (name split
// across Last/First/Middle Name columns rather than one combined field, same split for Father's
// Name, plus a lot of columns this app has no use for — PAN surrendered slots, discrepancy
// tracking, Aadhaar authentication flags, etc). Reuses the exact same match/create engine as the
// admin's own ack+punching template above (findPanAckPunchingMatch, same fill-gap-never-overwrite
// rule for email/father's name, same skeleton-creation fallback) — only the column layout and the
// name-building step differ, so this is not a copy of that logic, just a different front end to it.
// Which header text to look for is admin-configurable (Settings → Protean Report Columns) rather
// than hardcoded — see utils/proteanMapping.ts — so a future wording change doesn't need a code
// change, only a Settings update.
// ---------------------------------------------------------------------------

/** Protean's own "-" placeholder for a blank cell shouldn't be treated as a real value. */
function cleanProteanCell(v: string): string {
  const t = v.trim();
  return t === "-" || t === "--" ? "" : t;
}

function joinNameParts(parts: string[]): string {
  return parts.map(cleanProteanCell).filter(Boolean).join(" ");
}

interface PanProteanPunchingSummary {
  dryRun: boolean;
  detectedColumns: Record<string, boolean>;
  totalRows: number;
  matched: number;
  created: number;
  ambiguous: number;
  conflict: number;
  skipped: number;
  results: PanAckPunchingRowResult[];
}

async function runPanProteanPunchingImport(file: Express.Multer.File, dryRun: boolean): Promise<PanProteanPunchingSummary> {
  const worksheet = await loadWorksheet(file);
  const headerRow = worksheet.getRow(1);
  const mapping = await getProteanMapping("PAN");

  const findCol = (fragment: string | null) => (fragment ? findColumnByHeaderFragment(headerRow, fragment) : undefined);

  const ackCol = findCol(mapping.ackNumberHeader);
  const lastNameCol = findCol(mapping.applicantLastNameHeader);
  const firstNameCol = findCol(mapping.firstNameHeader);
  const middleNameCol = findCol(mapping.middleNameHeader);
  const fatherLastNameCol = findCol(mapping.fatherLastNameHeader);
  const fatherFirstNameCol = findCol(mapping.fatherFirstNameHeader);
  const fatherMiddleNameCol = findCol(mapping.fatherMiddleNameHeader);
  const dobCol = findCol(mapping.dobHeader);
  const emailCol = findCol(mapping.emailHeader);
  const mobileCol = findCol(mapping.mobileHeader);
  const punchingDateCol = findCol(mapping.punchingDateHeader);

  const detectedColumns: Record<string, boolean> = {
    "Acknowledgement Number": Boolean(ackCol),
    "Applicant Last Name": Boolean(lastNameCol),
    "First Name": Boolean(firstNameCol),
    "Middle Name": Boolean(middleNameCol),
    "Father's Last Name": Boolean(fatherLastNameCol),
    "Father's First Name": Boolean(fatherFirstNameCol),
    "Father's Middle Name": Boolean(fatherMiddleNameCol),
    "Date of Birth": Boolean(dobCol),
    "Email": Boolean(emailCol),
    "Telephone/Mobile": Boolean(mobileCol),
    "Punching Date": Boolean(punchingDateCol),
  };

  const missing: string[] = [];
  if (!ackCol) missing.push("Acknowledgement Number");
  if (!lastNameCol) missing.push("Applicant Last Name");
  if (!firstNameCol) missing.push("First Name");
  if (missing.length) {
    throw new ApiError(
      400,
      `Missing required column(s) in row 1: ${missing.join(", ")}. Check the configured header text under Settings → Protean Report Columns (PAN), or that this is the report exactly as downloaded from Protean.`
    );
  }

  const cellAt = (row: ExcelJS.Row, col: number | undefined): string => (col ? String(row.getCell(col).value ?? "").trim() : "");
  const cellRawAt = (row: ExcelJS.Row, col: number | undefined): unknown => (col ? row.getCell(col).value : undefined);

  const results: PanAckPunchingRowResult[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const ackNumber = cleanProteanCell(cellAt(row, ackCol));
    const applicantName = toUpper(joinNameParts([cellAt(row, firstNameCol), cellAt(row, middleNameCol), cellAt(row, lastNameCol)]));
    if (!ackNumber && !applicantName) continue; // fully blank row

    if (!ackNumber) {
      results.push({ row: rowNumber, outcome: "skipped", reason: "Missing Acknowledgement Number" });
      continue;
    }
    if (!applicantName) {
      results.push({ row: rowNumber, outcome: "skipped", reason: "Missing applicant name (First/Last Name columns blank)", ackNumber });
      continue;
    }

    const fatherName = toUpper(joinNameParts([cellAt(row, fatherFirstNameCol), cellAt(row, fatherMiddleNameCol), cellAt(row, fatherLastNameCol)]) || null);
    const email = toUpper(cleanProteanCell(cellAt(row, emailCol)) || null);
    const mobileDigits = cleanProteanCell(cellAt(row, mobileCol)).replace(/\D/g, "");
    const mobile = mobileDigits.length >= 10 ? mobileDigits.slice(-10) : null;
    const dob = parseCellDate(cellRawAt(row, dobCol));
    const punchingDate = parseCellDate(cellRawAt(row, punchingDateCol));
    const parsedRow = {
      dob: dob ? dob.toISOString().slice(0, 10) : null,
      mobile,
      email,
      fatherName,
      punchingDate: punchingDate ? punchingDate.toISOString().slice(0, 10) : null,
    };

    const { candidates, matchedVia } = await findPanAckPunchingMatch(applicantName, mobile, dob);

    // See findPanAckPunchingMatch's comment — a name+DOB-only match (no mobile on this row) is
    // never confident enough to auto-apply, regardless of candidate count.
    if (matchedVia === "dob" && candidates.length > 0) {
      results.push({
        row: rowNumber,
        outcome: "ambiguous",
        reason:
          candidates.length === 1
            ? `Matched application #${candidates[0].id} (${candidates[0].applicantName}) by name + date of birth only — this row has no mobile number to corroborate it, so it's not applied automatically. Confirm it's the same person before updating.`
            : `${candidates.length} existing applications match by name + date of birth only (no mobile on this row to narrow further) — resolve manually.`,
        candidateIds: candidates.map((c) => c.id),
        applicantName,
        ackNumber,
        parsedRow,
      });
      continue;
    }

    // Same 2-candidate auto-resolve and 3+-candidate manual-review rules as the ack+punching
    // template import above — see its comment for the reasoning.
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
        applicantName,
        ackNumber,
        parsedRow,
      });
      continue;
    }

    if (targets.length > 0) {
      const updatedIds: number[] = [];
      const conflictedIds: number[] = [];
      const rowDiscrepancies: FieldDiscrepancy[] = [];
      for (const existing of targets) {
        if (existing.ackNumber && existing.ackNumber !== ackNumber) {
          conflictedIds.push(existing.id);
          continue;
        }

        // The office's own on-file data vs. what this report says — flagged only where a value
        // was already on file (filling a blank isn't a mistake) and it disagrees. The match/
        // update proceeds regardless; this only records the disagreement for admin review.
        const discrepancies = [
          compareNameField("applicantName", existing.applicantName, applicantName),
          compareDateField("dob", existing.dob, dob),
          compareTextField("mobile", existing.mobile, mobile),
          compareTextField("email", existing.email, email),
          compareNameField("fatherName", existing.fatherName, fatherName),
        ].filter((d): d is FieldDiscrepancy => d !== null);

        if (!dryRun) {
          await prisma.panApplication.update({
            where: { id: existing.id },
            data: {
              ackNumber,
              punchingDate: punchingDate ?? undefined,
              status: existing.status === "UNDER_ENTRY" || existing.status === "PUSHED_TO_NSDL" ? "ACK_GENERATED" : undefined,
              email: !existing.email && email ? email : undefined,
              fatherName: !existing.fatherName && fatherName ? fatherName : undefined,
            },
          });
          await recordDiscrepancies("PAN", existing.id, ackNumber, existing.createdById, discrepancies);
        }
        rowDiscrepancies.push(...discrepancies);
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
          applicantName,
          ackNumber,
          parsedRow,
          discrepancies: rowDiscrepancies.length > 0 ? rowDiscrepancies : undefined,
        });
      } else {
        results.push({
          row: rowNumber,
          outcome: "conflict",
          reason: `${conflictedIds.length > 1 ? "Both matching applications" : `PAN #${conflictedIds[0]}`} already ${conflictedIds.length > 1 ? "have" : "has"} a different acknowledgement number — not overwritten`,
          panApplicationId: conflictedIds[0],
          candidateIds: conflictedIds.length > 1 ? conflictedIds : undefined,
          applicantName,
          ackNumber,
          parsedRow,
        });
      }
      continue;
    }

    // No existing application matches — create a walk-in skeleton straight away, already marked
    // Ack Generated (this report only ever lists applications Protean has already accepted).
    const createdId = dryRun
      ? undefined
      : (
          await prisma.panApplication.create({
            data: {
              applicationType: "NEW",
              applicantStatus: "INDIVIDUAL",
              residencyStatus: "RESIDENT",
              applicantName,
              dob: dob ?? undefined,
              mobile: mobile ?? undefined,
              email: email ?? undefined,
              fatherName: fatherName ?? undefined,
              signedStatus: "SIGNATURE",
              sourceType: "OFFICE",
              feeAmount: 0,
              paymentMode: "CASH",
              status: "ACK_GENERATED",
              ackNumber,
              punchingDate: punchingDate ?? undefined,
              notes: "Backfilled from Protean punching report import — verify and complete remaining details.",
              autoBackfilled: true,
            },
          })
        ).id;
    results.push({ row: rowNumber, outcome: "created", panApplicationId: createdId, applicantName, ackNumber, parsedRow });
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

export const previewPanProteanPunching = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(400, "No file uploaded — attach the import file as 'file'");
  const summary = await runPanProteanPunchingImport(req.file, true);
  res.json(summary);
});

export const importPanProteanPunching = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(400, "No file uploaded — attach the import file as 'file'");
  const summary = await runPanProteanPunchingImport(req.file, false);

  await logAudit(req, {
    action: "PAN_PROTEAN_PUNCHING_IMPORTED",
    entityType: "pan_applications",
    entityId: 0,
    meta: { sourceFile: req.file.originalname, totalRows: summary.totalRows },
  });

  res.json(summary);
});

/** A reference copy of Protean's own report layout — not something the office fills in by hand
 * (they upload Protean's real export), but a concrete example to check a real file against, or
 * to hand-build a batch from if Protean's own download is ever unavailable. If Protean tweaks a
 * header's exact wording, this stays useful as a reference for what the *columns* should be —
 * the actual text each one is matched against is separately configurable under Settings →
 * Protean Report Columns, so a wording change alone never needs a code change or a new template.
 */
export const downloadPanProteanTemplate = asyncHandler(async (_req: Request, res: Response) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Protean Punching Report");
  sheet.addRow([
    "Acknowledgement Number", "Applicant Last Name", "First Name", "Middle Name",
    "Date of Birth", "Father's Last Name", "Father's First Name", "Father's Middle Name",
    "Email ID", "Telephone No", "Date",
  ]);
  sheet.addRow([
    "794489700060265", "SHARMA", "ROHIT", "KUMAR",
    new Date(1995, 5, 15), "SHARMA", "SURESH", "-",
    "rohit.sharma@example.com", "9876543210", new Date(),
  ]);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="pan-protean-punching-report-sample.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});
