import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { logAudit } from "../../utils/audit";
import { sendMailStrict } from "../../utils/mailer";
import {
  DEFAULT_FIELD_REQUIREMENTS,
  FIELD_LABELS,
  getFieldRequirements,
  setFieldRequirements,
} from "../../utils/fieldRequirements";
import type { FieldRequirementModule } from "../../utils/fieldRequirements";
import { FEE_CATEGORIES, pickLatestVersions, upsertFeeScheduleDefault } from "../../utils/feeSchedule";
import type { FeeModuleKey } from "../../utils/feeSchedule";

const PASS_MASK = "********";
const ackMappingModuleSchema = z.enum(["PAN", "TAN"]);

export const getAckMapping = asyncHandler(async (req: Request, res: Response) => {
  const module = ackMappingModuleSchema.parse(req.params.module);
  const mapping = await prisma.ackImportMapping.findUnique({ where: { module } });
  res.json(
    mapping ?? {
      module,
      ackNumberHeader: "",
      matchAadhaarHeader: null,
      matchNameHeader: null,
      matchMobileHeader: null,
      matchDobHeader: null,
      updatedAt: null,
    }
  );
});

const upsertSchema = z
  .object({
    ackNumberHeader: z.string().min(1),
    matchAadhaarHeader: z.string().min(1).nullable().optional(),
    matchNameHeader: z.string().min(1).nullable().optional(),
    matchMobileHeader: z.string().min(1).nullable().optional(),
    matchDobHeader: z.string().min(1).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.matchAadhaarHeader && !data.matchNameHeader && !data.matchMobileHeader && !data.matchDobHeader) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["matchAadhaarHeader"],
        message: "At least one match column (Aadhaar, Name, Mobile, or DOB) must be set",
      });
    }
  });

export const upsertAckMapping = asyncHandler(async (req: Request, res: Response) => {
  const module = ackMappingModuleSchema.parse(req.params.module);
  const input = upsertSchema.parse(req.body);

  // TAN has no Aadhaar field on the application row — matching by it would silently never work.
  if (module === "TAN" && input.matchAadhaarHeader) {
    throw new ApiError(400, "Aadhaar matching isn't available for TAN — use Name, Mobile, and/or DOB instead.");
  }

  // This is a full-replace PUT, not a partial PATCH — a field left out of the request must
  // clear any previously saved header for it (Prisma's update() otherwise treats `undefined`
  // as "leave unchanged", which would let a stale match column silently keep applying).
  const data = {
    ackNumberHeader: input.ackNumberHeader,
    matchAadhaarHeader: module === "PAN" ? input.matchAadhaarHeader ?? null : null,
    matchNameHeader: input.matchNameHeader ?? null,
    matchMobileHeader: input.matchMobileHeader ?? null,
    matchDobHeader: input.matchDobHeader ?? null,
    updatedById: req.user?.kind === "staff" ? req.user.id : undefined,
  };

  const mapping = await prisma.ackImportMapping.upsert({
    where: { module },
    create: { module, ...data },
    update: data,
  });

  await logAudit(req, { action: "SETTINGS_ACK_MAPPING_UPDATED", entityType: "ack_import_mappings", entityId: mapping.id, meta: { module } });
  res.json(mapping);
});

// ---------------------------------------------------------------------------
// Email (SMTP) + day-end report configuration — singleton AppConfig row.
// ---------------------------------------------------------------------------

async function loadConfig() {
  return prisma.appConfig.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}

export const getEmailConfig = asyncHandler(async (_req: Request, res: Response) => {
  const cfg = await loadConfig();
  res.json({
    smtpHost: cfg.smtpHost ?? "",
    smtpPort: cfg.smtpPort,
    smtpSecure: cfg.smtpSecure,
    smtpUser: cfg.smtpUser ?? "",
    smtpPass: cfg.smtpPass ? PASS_MASK : "", // never return the real password
    smtpFrom: cfg.smtpFrom ?? "",
    dayEndReportTime: cfg.dayEndReportTime ?? "",
    updatedAt: cfg.updatedAt,
  });
});

const emailConfigSchema = z.object({
  smtpHost: z.string().optional(),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  smtpFrom: z.string().optional(),
  dayEndReportTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:MM (24h)").or(z.literal("")).optional(),
});

export const updateEmailConfig = asyncHandler(async (req: Request, res: Response) => {
  const input = emailConfigSchema.parse(req.body);
  const current = await loadConfig();

  const data: Record<string, unknown> = {
    smtpHost: input.smtpHost?.trim() || null,
    smtpPort: input.smtpPort ?? 587,
    smtpSecure: input.smtpSecure ?? false,
    smtpUser: input.smtpUser?.trim() || null,
    smtpFrom: input.smtpFrom?.trim() || null,
    dayEndReportTime: input.dayEndReportTime ? input.dayEndReportTime : null,
  };
  // Only overwrite the stored password when the client sends a new one (not the mask, not blank).
  if (input.smtpPass !== undefined && input.smtpPass !== PASS_MASK) {
    data.smtpPass = input.smtpPass || null;
  }
  void current;

  const cfg = await prisma.appConfig.update({ where: { id: 1 }, data });
  await logAudit(req, { action: "SETTINGS_EMAIL_UPDATED", entityType: "app_config", entityId: 1 });
  res.json({
    smtpHost: cfg.smtpHost ?? "",
    smtpPort: cfg.smtpPort,
    smtpSecure: cfg.smtpSecure,
    smtpUser: cfg.smtpUser ?? "",
    smtpPass: cfg.smtpPass ? PASS_MASK : "",
    smtpFrom: cfg.smtpFrom ?? "",
    dayEndReportTime: cfg.dayEndReportTime ?? "",
    updatedAt: cfg.updatedAt,
  });
});

export const sendTestEmail = asyncHandler(async (req: Request, res: Response) => {
  const to = z.string().email().parse((req.body as { to?: string }).to);
  try {
    await sendMailStrict({
      to,
      subject: "Office Management — SMTP test",
      text: "This is a test email confirming your SMTP settings work.",
    });
  } catch (err) {
    throw new ApiError(400, err instanceof Error ? err.message : "Failed to send test email");
  }
  await logAudit(req, { action: "SETTINGS_EMAIL_TEST_SENT", entityType: "app_config", entityId: 1, meta: { to } });
  res.json({ ok: true });
});

// Day-end report recipients (which staff get the automatic PDF).
export const getDayEndRecipients = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await prisma.dayEndReportRecipient.findMany({
    include: { staff: { select: { id: true, fullName: true, email: true } } },
  });
  res.json(rows.map((r) => r.staff));
});

export const setDayEndRecipients = asyncHandler(async (req: Request, res: Response) => {
  const ids = z.array(z.number().int()).parse((req.body as { staffIds?: number[] }).staffIds ?? []);
  await prisma.$transaction([
    prisma.dayEndReportRecipient.deleteMany({}),
    prisma.dayEndReportRecipient.createMany({ data: ids.map((staffId) => ({ staffId })), skipDuplicates: true }),
  ]);
  await logAudit(req, { action: "SETTINGS_DAY_END_RECIPIENTS_UPDATED", entityType: "app_config", entityId: 1, meta: { staffIds: ids } });
  res.json({ ok: true, count: ids.length });
});

// ---------------------------------------------------------------------------
// Admin-configurable per-field required/optional toggle for the PAN/TAN entry forms.
// ---------------------------------------------------------------------------

const fieldRequirementModuleSchema = z.enum(["PAN", "TAN"]);

export const getFieldRequirementsConfig = asyncHandler(async (req: Request, res: Response) => {
  const module = fieldRequirementModuleSchema.parse(req.params.module) as FieldRequirementModule;
  const required = await getFieldRequirements(module);
  res.json({
    module,
    fields: Object.keys(DEFAULT_FIELD_REQUIREMENTS[module]).map((key) => ({
      key,
      label: FIELD_LABELS[module][key],
      required: required[key],
    })),
  });
});

const updateFieldRequirementsSchema = z.object({ fields: z.record(z.boolean()) });

export const updateFieldRequirementsConfig = asyncHandler(async (req: Request, res: Response) => {
  const module = fieldRequirementModuleSchema.parse(req.params.module) as FieldRequirementModule;
  const { fields } = updateFieldRequirementsSchema.parse(req.body);
  await setFieldRequirements(module, fields);
  await logAudit(req, { action: "SETTINGS_FIELD_REQUIREMENTS_UPDATED", entityType: "field_requirements", entityId: 0, meta: { module, fields } });
  const required = await getFieldRequirements(module);
  res.json({
    module,
    fields: Object.keys(DEFAULT_FIELD_REQUIREMENTS[module]).map((key) => ({
      key,
      label: FIELD_LABELS[module][key],
      required: required[key],
    })),
  });
});

// ---------------------------------------------------------------------------
// Admin-editable notice text shown in the app shell (header/footer) and on the
// login page — e.g. a migration-cutover note, an office-wide announcement.
// ---------------------------------------------------------------------------

export const getSiteContent = asyncHandler(async (_req: Request, res: Response) => {
  const cfg = await loadConfig();
  res.json({
    headerNotice: cfg.headerNotice ?? "",
    footerNotice: cfg.footerNotice ?? "",
    loginNotice: cfg.loginNotice ?? "",
  });
});

const siteContentSchema = z.object({
  headerNotice: z.string().optional(),
  footerNotice: z.string().optional(),
  loginNotice: z.string().optional(),
});

export const updateSiteContent = asyncHandler(async (req: Request, res: Response) => {
  const input = siteContentSchema.parse(req.body);
  const data = {
    headerNotice: input.headerNotice?.trim() || null,
    footerNotice: input.footerNotice?.trim() || null,
    loginNotice: input.loginNotice?.trim() || null,
  };
  const updated = await prisma.appConfig.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  await logAudit(req, { action: "SETTINGS_SITE_CONTENT_UPDATED", entityType: "app_config", entityId: 1 });
  res.json({
    headerNotice: updated.headerNotice ?? "",
    footerNotice: updated.footerNotice ?? "",
    loginNotice: updated.loginNotice ?? "",
  });
});

// ---------------------------------------------------------------------------
// Fixed walk-in fee schedule for PAN/TAN (admin-configured defaults; agents
// get their own override rates managed from the Agents module instead).
// ---------------------------------------------------------------------------

const feeModuleSchema = z.enum(["PAN", "TAN"]);

export const getFeeSchedule = asyncHandler(async (req: Request, res: Response) => {
  const module = feeModuleSchema.parse(req.params.module) as FeeModuleKey;
  const rows = await prisma.feeScheduleDefault.findMany({ where: { module, effectiveFrom: { lte: new Date() } } });
  const latest = pickLatestVersions(rows, (r) => `${r.applicationType}:${r.signedStatus}`);
  res.json({
    module,
    categories: FEE_CATEGORIES[module].map((c) => ({
      applicationType: c.applicationType,
      signedStatus: c.signedStatus,
      label: c.label,
      amount: latest.has(`${c.applicationType}:${c.signedStatus}`) ? Number(latest.get(`${c.applicationType}:${c.signedStatus}`)!.amount) : null,
    })),
  });
});

const updateFeeScheduleSchema = z.object({
  rates: z.array(
    z.object({
      applicationType: z.enum(["NEW", "CORRECTION"]),
      signedStatus: z.enum(["", "SIGNATURE", "THUMB"]),
      amount: z.number().nonnegative(),
    })
  ),
  // When entering rates that should also apply to past forms (e.g. a one-time cleanup of
  // historical data after the matrix was first populated), pass an earlier date here. Defaults
  // to today, i.e. a normal forward-looking change.
  effectiveFrom: z.string().optional(),
});

export const updateFeeSchedule = asyncHandler(async (req: Request, res: Response) => {
  const module = feeModuleSchema.parse(req.params.module) as FeeModuleKey;
  const { rates, effectiveFrom } = updateFeeScheduleSchema.parse(req.body);
  const ef = effectiveFrom ? new Date(effectiveFrom) : new Date();
  for (const rate of rates) {
    await upsertFeeScheduleDefault(module, rate.applicationType, rate.signedStatus, rate.amount, ef);
  }
  await logAudit(req, { action: "SETTINGS_FEE_SCHEDULE_UPDATED", entityType: "fee_schedule_defaults", entityId: 0, meta: { module, rates, effectiveFrom: ef.toISOString() } });
  res.json({ ok: true });
});
