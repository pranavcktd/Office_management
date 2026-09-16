import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { ApiError, asyncHandler } from "../../utils/asyncHandler";
import { logAudit } from "../../utils/audit";
import { parseDdMmYyyy } from "../../utils/date";
import { localDateRange } from "../../utils/dateRange";
import { paginatedResponse, paginationQuerySchema } from "../../utils/pagination";

function isPrivilegedViewer(req: Request): boolean {
  return req.user?.kind === "staff" && (req.user.role === "ADMIN" || req.user.role === "AUDITOR");
}

// A staff member's ledger balance: positive means they owe the office (net DEBITs), negative
// means the office owes them (net CREDITs). Mirrors the sign convention of the existing
// agent fee-due ledger (standardFeeAmount - feeAmount) for consistency across the app.
function balanceOf(entries: { type: "DEBIT" | "CREDIT"; amount: unknown }[]): number {
  return entries.reduce((sum, e) => sum + (e.type === "DEBIT" ? Number(e.amount) : -Number(e.amount)), 0);
}

export const getSummary = asyncHandler(async (req: Request, res: Response) => {
  const privileged = isPrivilegedViewer(req);
  const staff = privileged
    ? await prisma.staff.findMany({ where: { isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } })
    : await prisma.staff.findMany({ where: { id: req.user!.id }, select: { id: true, fullName: true } });

  const entries = await prisma.staffLedgerEntry.findMany({
    where: { staffId: { in: staff.map((s) => s.id) } },
    select: { staffId: true, type: true, amount: true },
  });
  const byStaff = new Map<number, { type: "DEBIT" | "CREDIT"; amount: unknown }[]>();
  for (const e of entries) {
    if (!byStaff.has(e.staffId)) byStaff.set(e.staffId, []);
    byStaff.get(e.staffId)!.push(e);
  }

  res.json(
    staff.map((s) => ({
      staffId: s.id,
      staffName: s.fullName,
      balance: balanceOf(byStaff.get(s.id) ?? []),
    }))
  );
});

const listQuerySchema = z
  .object({
    staffId: z.coerce.number().int(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .merge(paginationQuerySchema);

export const listEntries = asyncHandler(async (req: Request, res: Response) => {
  const { staffId, from, to, page, pageSize } = listQuerySchema.parse(req.query);
  if (!isPrivilegedViewer(req) && staffId !== req.user!.id) {
    throw new ApiError(403, "You can only view your own ledger");
  }
  const entryDateRange = localDateRange(from, to);
  const where = { staffId, ...(entryDateRange ? { entryDate: entryDateRange } : {}) };

  const [items, total, allForBalance] = await Promise.all([
    prisma.staffLedgerEntry.findMany({
      where,
      include: { createdBy: { select: { id: true, fullName: true } } },
      orderBy: { entryDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.staffLedgerEntry.count({ where }),
    // Balance always reflects the whole ledger, not just the current date-filtered page.
    prisma.staffLedgerEntry.findMany({ where: { staffId }, select: { type: true, amount: true } }),
  ]);

  res.json({ ...paginatedResponse(items, total, page, pageSize), balance: balanceOf(allForBalance) });
});

const upsertSchema = z.object({
  staffId: z.number().int(),
  type: z.enum(["DEBIT", "CREDIT"]),
  amount: z.number().positive(),
  note: z.string().min(1, "A note is required"),
  entryDate: z.string(),
});

export const createEntry = asyncHandler(async (req: Request, res: Response) => {
  const input = upsertSchema.parse(req.body);
  const staff = await prisma.staff.findUnique({ where: { id: input.staffId } });
  if (!staff) throw new ApiError(404, "Staff member not found");

  const entry = await prisma.staffLedgerEntry.create({
    data: {
      staffId: input.staffId,
      type: input.type,
      amount: input.amount,
      note: input.note,
      entryDate: parseDdMmYyyy(input.entryDate),
      createdById: req.user!.id,
    },
    include: { createdBy: { select: { id: true, fullName: true } } },
  });
  await logAudit(req, {
    action: "STAFF_LEDGER_ENTRY_ADDED",
    entityType: "staff_ledger_entries",
    entityId: entry.id,
    meta: { staffId: input.staffId, type: input.type, amount: input.amount },
  });
  res.status(201).json(entry);
});

export const updateEntry = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = await prisma.staffLedgerEntry.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Ledger entry not found");

  const input = upsertSchema.parse(req.body);
  const entry = await prisma.staffLedgerEntry.update({
    where: { id },
    data: {
      staffId: input.staffId,
      type: input.type,
      amount: input.amount,
      note: input.note,
      entryDate: parseDdMmYyyy(input.entryDate),
    },
    include: { createdBy: { select: { id: true, fullName: true } } },
  });
  await logAudit(req, {
    action: "STAFF_LEDGER_ENTRY_UPDATED",
    entityType: "staff_ledger_entries",
    entityId: entry.id,
    meta: { staffId: input.staffId, type: input.type, amount: input.amount },
  });
  res.json(entry);
});

export const deleteEntry = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = await prisma.staffLedgerEntry.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Ledger entry not found");

  await prisma.staffLedgerEntry.delete({ where: { id } });
  await logAudit(req, {
    action: "STAFF_LEDGER_ENTRY_DELETED",
    entityType: "staff_ledger_entries",
    entityId: id,
    meta: { staffId: existing.staffId, type: existing.type, amount: Number(existing.amount) },
  });
  res.status(204).send();
});
