import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { logAudit } from "../../utils/audit";
import { MODULE_KEYS } from "../../utils/modules";
import { DEFAULT_PASSWORD } from "../../utils/password";
import { mobileSchema } from "../../utils/validators";
import { paginatedResponse, paginationQuerySchema, toSkipTake } from "../../utils/pagination";
import { balanceOf } from "../staff-ledger/staff-ledger.controller";

const modulesSchema = z.array(z.enum(MODULE_KEYS)).optional();

const createStaffSchema = z.object({
  fullName: z.string().min(1),
  mobile: mobileSchema,
  // Every staff account logs in with email+password, so this is mandatory for everyone now,
  // not just Admin.
  email: z.string().email(),
  role: z.enum(["ADMIN", "STAFF", "AUDITOR"]).default("STAFF"),
  modules: modulesSchema,
});

const updateStaffSchema = z.object({
  fullName: z.string().min(1).optional(),
  mobile: mobileSchema.optional(),
  email: z.string().email().optional(),
  role: z.enum(["ADMIN", "STAFF", "AUDITOR"]).optional(),
  isActive: z.boolean().optional(),
  modules: modulesSchema,
});

const staffSelect = {
  id: true,
  fullName: true,
  mobile: true,
  email: true,
  role: true,
  modules: true,
  isActive: true,
  createdAt: true,
  lastLoginAt: true,
} as const;

// Several screens (query assignment dropdown, day-end report recipient picker) fetch the full
// staff list and expect a plain array — pagination only kicks in when the Users list page
// explicitly asks for it via ?page=, so those keep working unchanged.
export const listStaff = asyncHandler(async (req: Request, res: Response) => {
  if (req.query.page === undefined) {
    const staff = await prisma.staff.findMany({ select: staffSelect, orderBy: { fullName: "asc" } });
    res.json(staff);
    return;
  }

  const { page, pageSize } = paginationQuerySchema.parse(req.query);
  const [staff, total] = await Promise.all([
    prisma.staff.findMany({ select: staffSelect, orderBy: { fullName: "asc" }, ...toSkipTake(page, pageSize) }),
    prisma.staff.count(),
  ]);
  res.json(paginatedResponse(staff, total, page, pageSize));
});

export const getStaff = asyncHandler(async (req: Request, res: Response) => {
  const staff = await prisma.staff.findUnique({ where: { id: Number(req.params.id) }, select: staffSelect });
  if (!staff) throw new ApiError(404, "Staff member not found");
  res.json(staff);
});

// Read-only "view this staff member's login" — admin (and auditor, whose whole purpose is
// company-wide visibility) can see a consolidated snapshot of what a staff member's own account
// looks like, without literally impersonating them or browsing the app as them. Never exposes
// any action here — no punch/edit/assign endpoints are reachable from this data.
export const getStaffProfile = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const staff = await prisma.staff.findUnique({ where: { id }, select: staffSelect });
  if (!staff) throw new ApiError(404, "Staff member not found");

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    recentAttendance,
    monthAttendance,
    ledgerEntries,
    assignedQueriesByStatus,
    panEntryCount,
    tanEntryCount,
  ] = await Promise.all([
    prisma.attendance.findMany({ where: { staffId: id }, orderBy: { workDate: "desc" }, take: 10 }),
    prisma.attendance.findMany({ where: { staffId: id, workDate: { gte: monthStart } }, select: { status: true } }),
    prisma.staffLedgerEntry.findMany({ where: { staffId: id }, orderBy: { entryDate: "desc" }, take: 10 }),
    prisma.clientQuery.groupBy({ by: ["status"], where: { assignedToId: id }, _count: true }),
    prisma.panApplication.count({ where: { createdById: id } }),
    prisma.tanApplication.count({ where: { createdById: id } }),
  ]);

  const allLedgerEntries = await prisma.staffLedgerEntry.findMany({ where: { staffId: id }, select: { type: true, amount: true } });

  const monthSummary = { PRESENT: 0, HALF_DAY: 0, ABSENT: 0, OVERTIME: 0 };
  for (const r of monthAttendance) monthSummary[r.status] += 1;

  const assignedQueries = assignedQueriesByStatus.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = r._count;
    return acc;
  }, {});

  res.json({
    staff,
    attendance: { recent: recentAttendance, monthSummary },
    ledger: { balance: balanceOf(allLedgerEntries), recentEntries: ledgerEntries },
    assignedQueries,
    entries: { pan: panEntryCount, tan: tanEntryCount },
  });
});

export const createStaff = asyncHandler(async (req: Request, res: Response) => {
  const input = createStaffSchema.parse(req.body);
  const existing = await prisma.staff.findUnique({ where: { mobile: input.mobile } });
  if (existing) throw new ApiError(409, "A staff member with this mobile already exists");

  // New accounts always start on the default password and must change it on first login —
  // nobody (including the admin creating the account) hand-picks an initial password.
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  try {
    const staff = await prisma.staff.create({
      data: {
        fullName: input.fullName,
        mobile: input.mobile,
        email: input.email.toLowerCase(),
        passwordHash,
        mustChangePassword: true,
        role: input.role,
        modules: input.role === "ADMIN" ? [] : input.modules ?? [],
      },
      select: staffSelect,
    });
    await logAudit(req, { action: "STAFF_CREATED", entityType: "staff", entityId: staff.id, meta: { role: staff.role, modules: staff.modules } });
    res.status(201).json(staff);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ApiError(409, "That email is already in use");
    }
    throw err;
  }
});

export const updateStaff = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const input = updateStaffSchema.parse(req.body);

  if (input.mobile) {
    const existing = await prisma.staff.findUnique({ where: { mobile: input.mobile } });
    if (existing && existing.id !== id) {
      throw new ApiError(409, "Another staff member already uses this mobile number");
    }
  }

  const data: Prisma.StaffUpdateInput = {
    fullName: input.fullName,
    mobile: input.mobile,
    email: input.email === undefined ? undefined : input.email.toLowerCase(),
    role: input.role,
    isActive: input.isActive,
  };
  if (input.modules !== undefined) {
    data.modules = input.role === "ADMIN" ? [] : input.modules;
  }

  try {
    const staff = await prisma.staff.update({ where: { id }, data, select: staffSelect });
    await logAudit(req, { action: "STAFF_UPDATED", entityType: "staff", entityId: id, meta: { fields: Object.keys(data) } });
    res.json(staff);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") throw new ApiError(409, "That email is already in use");
      if (err.code === "P2025") throw new ApiError(404, "Staff member not found");
    }
    throw err;
  }
});

export const resetStaffPassword = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  await prisma.staff.update({
    where: { id },
    data: { passwordHash, mustChangePassword: true, pendingPasswordHash: null, pendingPasswordExpiresAt: null },
  });
  await logAudit(req, { action: "STAFF_PASSWORD_RESET", entityType: "staff", entityId: id });
  res.json({ ok: true, defaultPassword: DEFAULT_PASSWORD });
});

export const deactivateStaff = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (req.user?.kind === "staff" && req.user.id === id) {
    throw new ApiError(400, "You cannot deactivate your own account");
  }
  const staff = await prisma.staff.update({ where: { id }, data: { isActive: false }, select: staffSelect });
  await logAudit(req, { action: "STAFF_DEACTIVATED", entityType: "staff", entityId: id });
  res.json(staff);
});
