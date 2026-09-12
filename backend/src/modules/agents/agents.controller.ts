import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { logAudit } from "../../utils/audit";
import { DEFAULT_PASSWORD } from "../../utils/password";
import { mobileSchema } from "../../utils/validators";
import { FEE_CATEGORIES, lookupStandardFee, pickLatestVersions, upsertAgentFeeRate } from "../../utils/feeSchedule";
import { findColumnByHeader, loadWorksheet } from "../../utils/excelImport";
import { paginatedResponse, paginationQuerySchema, toSkipTake } from "../../utils/pagination";

// One entry per FEE_CATEGORIES row (4 for PAN, 2 for TAN) — amount null means "use the office
// walk-in default for this category" rather than a rate of zero.
const feeRateSchema = z.object({
  module: z.enum(["PAN", "TAN"]),
  applicationType: z.enum(["NEW", "CORRECTION"]),
  signedStatus: z.enum(["", "SIGNATURE", "THUMB"]),
  amount: z.number().nonnegative().nullable(),
});

const agentSchema = z.object({
  agentName: z.string().min(1),
  firmName: z.string().optional(),
  mobile: mobileSchema,
  email: z.string().email().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  // Portal login isn't required for every agent; when requested, the account starts on the
  // default password (same "must change on first login" pattern as staff), not an admin-picked one.
  enablePortalAccess: z.boolean().optional(),
  feeRates: z.array(feeRateSchema).optional(),
});

const updateAgentSchema = agentSchema.partial().extend({
  isActive: z.boolean().optional(),
});

async function loadAgentFeeRates(agentId: number) {
  const rows = await prisma.agentFeeRate.findMany({ where: { agentId, effectiveFrom: { lte: new Date() } } });
  const latest = pickLatestVersions(rows, (r) => `${r.module}:${r.applicationType}:${r.signedStatus}`);
  return (Object.keys(FEE_CATEGORIES) as Array<keyof typeof FEE_CATEGORIES>).flatMap((module) =>
    FEE_CATEGORIES[module].map((c) => {
      const row = latest.get(`${module}:${c.applicationType}:${c.signedStatus}`);
      return {
        module,
        applicationType: c.applicationType,
        signedStatus: c.signedStatus,
        label: c.label,
        amount: row && row.amount !== null ? Number(row.amount) : null,
      };
    })
  );
}

async function saveAgentFeeRates(agentId: number, feeRates: z.infer<typeof feeRateSchema>[], effectiveFrom?: Date) {
  for (const rate of feeRates) {
    await upsertAgentFeeRate(agentId, rate.module, rate.applicationType, rate.signedStatus, rate.amount, effectiveFrom);
  }
}

const agentSelect = {
  id: true,
  agentName: true,
  firmName: true,
  mobile: true,
  email: true,
  address: true,
  isActive: true,
  notes: true,
  passwordHash: true,
  createdAt: true,
  lastLoginAt: true,
} satisfies Prisma.AgentSelect;

// Plenty of screens (PAN/TAN entry forms, adjustment lookup, dashboards) fetch the full active
// agent list to populate a dropdown and expect a plain array — pagination only kicks in when a
// caller (the Agents list page) explicitly asks for it via ?page=, so those keep working unchanged.
export const listAgents = asyncHandler(async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const q = req.query.q as string | undefined;
  const where: Prisma.AgentWhereInput = {
    ...(status === "ACTIVE" ? { isActive: true } : status === "INACTIVE" ? { isActive: false } : {}),
    ...(q
      ? {
          OR: [
            { agentName: { contains: q, mode: "insensitive" } },
            { firmName: { contains: q, mode: "insensitive" } },
            { mobile: { contains: q } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const strip = (a: { passwordHash: string | null }) => {
    const { passwordHash, ...rest } = a;
    return { ...rest, hasPortalAccess: Boolean(passwordHash) };
  };

  if (req.query.page === undefined) {
    const agents = await prisma.agent.findMany({ where, orderBy: { agentName: "asc" }, select: agentSelect });
    res.json(agents.map(strip));
    return;
  }

  const { page, pageSize } = paginationQuerySchema.parse(req.query);
  const [agents, total] = await Promise.all([
    prisma.agent.findMany({ where, orderBy: { agentName: "asc" }, select: agentSelect, ...toSkipTake(page, pageSize) }),
    prisma.agent.count({ where }),
  ]);
  res.json(paginatedResponse(agents.map(strip), total, page, pageSize));
});

export const getAgent = asyncHandler(async (req: Request, res: Response) => {
  const agent = await prisma.agent.findUnique({ where: { id: Number(req.params.id) } });
  if (!agent) throw new ApiError(404, "Agent not found");
  const { passwordHash, ...rest } = agent;
  const feeRates = await loadAgentFeeRates(agent.id);
  res.json({ ...rest, hasPortalAccess: Boolean(passwordHash), feeRates });
});

export const createAgent = asyncHandler(async (req: Request, res: Response) => {
  const input = agentSchema.parse(req.body);
  if (input.enablePortalAccess && !input.email) {
    throw new ApiError(400, "An email is required to enable agent portal login");
  }
  const passwordHash = input.enablePortalAccess ? await bcrypt.hash(DEFAULT_PASSWORD, 10) : null;
  try {
    const agent = await prisma.agent.create({
      data: {
        agentName: input.agentName,
        firmName: input.firmName,
        mobile: input.mobile,
        email: input.email?.toLowerCase(),
        address: input.address,
        notes: input.notes,
        passwordHash,
        mustChangePassword: Boolean(input.enablePortalAccess),
      },
    });
    if (input.feeRates?.length) {
      await saveAgentFeeRates(agent.id, input.feeRates);
    }
    await logAudit(req, { action: "AGENT_CREATED", entityType: "agents", entityId: agent.id });
    const { passwordHash: hash, ...rest } = agent;
    const feeRates = await loadAgentFeeRates(agent.id);
    res.status(201).json({ ...rest, hasPortalAccess: Boolean(hash), feeRates });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ApiError(409, "That email is already in use");
    }
    throw err;
  }
});

export const updateAgent = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const input = updateAgentSchema.parse(req.body);
  const data: Record<string, unknown> = { ...input };
  delete data.enablePortalAccess;
  delete data.feeRates;
  if (input.email !== undefined) data.email = input.email.toLowerCase();

  if (input.enablePortalAccess) {
    const existing = await prisma.agent.findUnique({ where: { id } });
    const willHaveEmail = input.email ?? existing?.email;
    if (!willHaveEmail) {
      throw new ApiError(400, "An email is required to enable agent portal login");
    }
    if (existing && !existing.passwordHash) {
      data.passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
      data.mustChangePassword = true;
    }
  }

  try {
    const agent = await prisma.agent.update({ where: { id }, data });
    if (input.feeRates) {
      await saveAgentFeeRates(id, input.feeRates);
    }
    await logAudit(req, { action: "AGENT_UPDATED", entityType: "agents", entityId: id, meta: { fields: Object.keys(data) } });
    const { passwordHash: hash, ...rest } = agent;
    const feeRates = await loadAgentFeeRates(id);
    res.json({ ...rest, hasPortalAccess: Boolean(hash), feeRates });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ApiError(409, "That email is already in use");
    }
    throw err;
  }
});

export const resetAgentPassword = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) throw new ApiError(404, "Agent not found");
  if (!agent.email) throw new ApiError(400, "This agent has no email on file — add one first to enable portal login");
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  await prisma.agent.update({
    where: { id },
    data: { passwordHash, mustChangePassword: true, pendingPasswordHash: null, pendingPasswordExpiresAt: null },
  });
  await logAudit(req, { action: "AGENT_PASSWORD_RESET", entityType: "agents", entityId: id });
  res.json({ ok: true, defaultPassword: DEFAULT_PASSWORD });
});

export const deleteAgent = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [panCount, tanCount] = await Promise.all([
    prisma.panApplication.count({ where: { agentId: id } }),
    prisma.tanApplication.count({ where: { agentId: id } }),
  ]);
  if (panCount > 0 || tanCount > 0) {
    throw new ApiError(
      409,
      "Agent has linked PAN/TAN applications and cannot be deleted; deactivate instead"
    );
  }
  await prisma.agent.delete({ where: { id } });
  res.status(204).send();
});

// Positive = agent owes the office (collected less than the fixed fee); negative = the office
// owes the agent. Shared by the ledger endpoint and the Fee Matrix settlement column.
async function computeFeeDueFromAgent(agentId: number) {
  const [panFeeRows, tanFeeRows] = await Promise.all([
    prisma.panApplication.findMany({ where: { agentId, standardFeeAmount: { not: null } }, select: { feeAmount: true, standardFeeAmount: true } }),
    prisma.tanApplication.findMany({ where: { agentId, standardFeeAmount: { not: null } }, select: { feeAmount: true, standardFeeAmount: true } }),
  ]);
  return [...panFeeRows, ...tanFeeRows].reduce(
    (sum, r) => sum + (Number(r.standardFeeAmount) - Number(r.feeAmount)),
    0
  );
}

// All active agents + their fee rates in one call, for the admin Fee Matrix page — avoids
// fetching each agent's rates one at a time just to render an overview table. Also surfaces
// each agent's current fee settlement so the admin can see it right where rates are edited.
export const getFeeMatrix = asyncHandler(async (_req: Request, res: Response) => {
  const agents = await prisma.agent.findMany({
    where: { isActive: true },
    orderBy: { agentName: "asc" },
    select: { id: true, agentName: true, firmName: true },
  });
  const matrix = await Promise.all(
    agents.map(async (agent) => ({
      ...agent,
      feeRates: await loadAgentFeeRates(agent.id),
      feeDueFromAgent: await computeFeeDueFromAgent(agent.id),
    }))
  );
  res.json(matrix);
});

const setFeeRatesSchema = z.object({
  feeRates: z.array(feeRateSchema),
  // Pass an earlier date to also correct how past forms are read as "settled" (via Recompute
  // Standard Fee) — defaults to today, a normal forward-looking change.
  effectiveFrom: z.string().optional(),
});

export const setAgentFeeRates = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) throw new ApiError(404, "Agent not found");
  const { feeRates, effectiveFrom } = setFeeRatesSchema.parse(req.body);
  await saveAgentFeeRates(id, feeRates, effectiveFrom ? new Date(effectiveFrom) : undefined);
  await logAudit(req, { action: "AGENT_FEE_RATES_UPDATED", entityType: "agents", entityId: id });
  res.json({ feeRates: await loadAgentFeeRates(id) });
});

// Applies one fee structure to many agents at once — most agents share near-identical rates,
// so this lets the admin set them all in one shot and only hand-adjust the few that differ.
const bulkSetFeeRatesSchema = z.object({
  agentIds: z.array(z.number().int()).optional(),
  feeRates: z.array(feeRateSchema),
  effectiveFrom: z.string().optional(),
});

export const bulkSetAgentFeeRates = asyncHandler(async (req: Request, res: Response) => {
  const { agentIds, feeRates, effectiveFrom } = bulkSetFeeRatesSchema.parse(req.body);
  const targetIds =
    agentIds && agentIds.length > 0
      ? agentIds
      : (await prisma.agent.findMany({ where: { isActive: true }, select: { id: true } })).map((a) => a.id);

  const ef = effectiveFrom ? new Date(effectiveFrom) : undefined;
  for (const id of targetIds) {
    await saveAgentFeeRates(id, feeRates, ef);
  }
  await logAudit(req, { action: "AGENT_FEE_RATES_BULK_UPDATED", entityType: "agents", entityId: 0 });
  res.json({ updatedAgentIds: targetIds });
});

// One-time (or occasional) cleanup: re-runs the standard-fee lookup for an agent's existing
// PAN/TAN forms against the fee schedule as it stood on each form's own received date, and
// updates the stored standardFeeAmount. Needed because that field is a snapshot taken when the
// form was saved — entering/correcting a rate in the Fee Matrix afterwards doesn't retroactively
// touch forms already on file until this is run. Never touches feeAmount (what was actually
// collected) — only the computed comparison figure.
const recomputeStandardFeeSchema = z.object({ agentIds: z.array(z.number().int()).optional() });

export const recomputeStandardFee = asyncHandler(async (req: Request, res: Response) => {
  const { agentIds } = recomputeStandardFeeSchema.parse(req.body);
  const targetIds =
    agentIds && agentIds.length > 0
      ? agentIds
      : (await prisma.agent.findMany({ select: { id: true } })).map((a) => a.id);

  let updated = 0;
  for (const agentId of targetIds) {
    const pans = await prisma.panApplication.findMany({
      where: { agentId, sourceType: "AGENT" },
      select: { id: true, applicationType: true, signedStatus: true, formReceivedDate: true, createdAt: true, standardFeeAmount: true },
    });
    for (const p of pans) {
      const amount = await lookupStandardFee({
        module: "PAN",
        applicationType: p.applicationType,
        signedStatus: p.signedStatus,
        sourceType: "AGENT",
        agentId,
        asOf: p.formReceivedDate ?? p.createdAt,
      });
      if (amount !== null && amount !== (p.standardFeeAmount === null ? null : Number(p.standardFeeAmount))) {
        await prisma.panApplication.update({ where: { id: p.id }, data: { standardFeeAmount: amount } });
        updated++;
      }
    }

    const tans = await prisma.tanApplication.findMany({
      where: { agentId, sourceType: "AGENT" },
      select: { id: true, applicationType: true, formReceivedDate: true, createdAt: true, standardFeeAmount: true },
    });
    for (const t of tans) {
      const amount = await lookupStandardFee({
        module: "TAN",
        applicationType: t.applicationType,
        signedStatus: "",
        sourceType: "AGENT",
        agentId,
        asOf: t.formReceivedDate ?? t.createdAt,
      });
      if (amount !== null && amount !== (t.standardFeeAmount === null ? null : Number(t.standardFeeAmount))) {
        await prisma.tanApplication.update({ where: { id: t.id }, data: { standardFeeAmount: amount } });
        updated++;
      }
    }
  }

  await logAudit(req, { action: "AGENT_STANDARD_FEE_RECOMPUTED", entityType: "agents", entityId: 0, meta: { agentIds: targetIds, updated } });
  res.json({ agentsProcessed: targetIds.length, formsUpdated: updated });
});

export const getAgentLedger = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) throw new ApiError(404, "Agent not found");

  const [
    panSubmitted,
    panAccepted,
    panRejected,
    panAdjustmentAvailable,
    tanSubmitted,
    tanAccepted,
    tanRejected,
    tanAdjustmentAvailable,
    feeDueFromAgent,
  ] = await Promise.all([
    prisma.panApplication.count({ where: { agentId: id } }),
    prisma.panApplication.count({ where: { agentId: id, status: "ACK_GENERATED" } }),
    prisma.panApplication.count({ where: { agentId: id, status: "REJECTED" } }),
    prisma.panApplication.count({ where: { agentId: id, adjustmentAvailable: true } }),
    prisma.tanApplication.count({ where: { agentId: id } }),
    prisma.tanApplication.count({ where: { agentId: id, status: "ACK_GENERATED" } }),
    prisma.tanApplication.count({ where: { agentId: id, status: "REJECTED" } }),
    prisma.tanApplication.count({ where: { agentId: id, adjustmentAvailable: true } }),
    computeFeeDueFromAgent(id),
  ]);

  res.json({
    agentId: id,
    forms: {
      submitted: panSubmitted + tanSubmitted,
      accepted: panAccepted + tanAccepted,
      rejected: panRejected + tanRejected,
    },
    adjustmentBalance: panAdjustmentAvailable + tanAdjustmentAvailable,
    feeDueFromAgent,
    breakdown: {
      pan: { submitted: panSubmitted, accepted: panAccepted, rejected: panRejected, adjustmentAvailable: panAdjustmentAvailable },
      tan: { submitted: tanSubmitted, accepted: tanAccepted, rejected: tanRejected, adjustmentAvailable: tanAdjustmentAvailable },
    },
  });
});

// ---------------------------------------------------------------------------
// Bulk import (Excel) — real-world agent lists are often messy (placeholder
// mobiles, duplicate/blank emails), so a row is only failed outright when the
// agent name itself is missing; a bad or duplicate email is dropped with a
// note instead of rejecting the whole row.
// ---------------------------------------------------------------------------

const AGENT_IMPORT_HEADERS = ["Agent Name", "Mobile Number", "Email", "Office Address"] as const;

export const downloadAgentImportTemplate = asyncHandler(async (_req: Request, res: Response) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Agents Import");
  sheet.addRow(AGENT_IMPORT_HEADERS as unknown as string[]);
  sheet.addRow(["Ramesh Kumar", "9876543210", "ramesh.kumar@example.com", "Main Road, Karwi"]);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="agents-import-template.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

interface AgentImportRowResult {
  row: number;
  outcome: "created" | "failed";
  reason?: string;
  agentId?: number;
  applicantName?: string;
}

export const importAgentsBulk = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(400, "No file uploaded — attach the import file as 'file'");
  const worksheet = await loadWorksheet(req.file);
  const headerRow = worksheet.getRow(1);

  const cols: Record<string, number | undefined> = {};
  for (const header of AGENT_IMPORT_HEADERS) {
    cols[header] = findColumnByHeader(headerRow, header);
  }
  if (!cols["Agent Name"]) {
    throw new ApiError(400, 'Missing required column "Agent Name" in row 1. Download the template for the exact expected headers.');
  }

  const cell = (row: ExcelJS.Row, header: (typeof AGENT_IMPORT_HEADERS)[number]): string => {
    const col = cols[header];
    if (!col) return "";
    return String(row.getCell(col).value ?? "").trim();
  };

  // Tracks emails already claimed by this import batch (case-insensitive), so two rows in the
  // same file that share an email don't both try to claim it — the first wins, later ones are
  // imported with the email dropped rather than failing the whole row.
  const emailsUsedThisBatch = new Set<string>(
    (await prisma.agent.findMany({ where: { email: { not: null } }, select: { email: true } })).map((a) =>
      (a.email as string).toLowerCase()
    )
  );

  const results: AgentImportRowResult[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const agentName = cell(row, "Agent Name");
    const mobile = cell(row, "Mobile Number");
    const address = cell(row, "Office Address");
    if (!agentName && !mobile) continue; // fully blank row

    if (!agentName) {
      results.push({ row: rowNumber, outcome: "failed", reason: "Agent Name is mandatory" });
      continue;
    }

    try {
      const notes: string[] = [];

      let email: string | undefined;
      const emailRaw = cell(row, "Email").toLowerCase();
      if (emailRaw) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
          notes.push(`Email "${emailRaw}" is not a valid address — skipped, row still imported`);
        } else if (emailsUsedThisBatch.has(emailRaw)) {
          notes.push(`Email "${emailRaw}" is already used by another agent — skipped, row still imported`);
        } else {
          email = emailRaw;
          emailsUsedThisBatch.add(emailRaw);
        }
      }

      const agent = await prisma.agent.create({
        data: {
          agentName,
          mobile: mobile || "",
          email,
          address: address || undefined,
        },
      });

      await logAudit(req, { action: "AGENT_CREATED", entityType: "agents", entityId: agent.id, meta: { source: "bulk_import" } });
      results.push({
        row: rowNumber,
        outcome: "created",
        agentId: agent.id,
        applicantName: agentName,
        reason: notes.length ? notes.join("; ") : undefined,
      });
    } catch (err) {
      const reason =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
          ? "That email is already in use"
          : err instanceof Error
            ? err.message
            : "Unknown error";
      results.push({ row: rowNumber, outcome: "failed", reason, applicantName: agentName });
    }
  }

  res.json({
    totalRows: results.length,
    created: results.filter((r) => r.outcome === "created").length,
    failed: results.filter((r) => r.outcome === "failed").length,
    results,
  });
});
