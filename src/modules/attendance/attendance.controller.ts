import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { exportPdf, exportXlsx } from "../../utils/export";
import type { ExportColumn } from "../../utils/export";
import { logAudit } from "../../utils/audit";
import { FULL_DAY_END_HHMM, FULL_DAY_START_HHMM, computeAttendanceStatus, totalWorkedMinutes } from "./attendance.service";

/** A Postgres TIME comes back as an epoch-date ISO string; show just HH:MM (its UTC time-of-day). */
function timeCell(value: Date | null): string {
  if (!value) return "";
  const d = new Date(value);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

// "Today" for a self-punch must be the office's own local calendar date, not UTC's — UTC
// midnight is 5:30am IST, so using UTC date components here would misfile any punch made in the
// first few hours after local midnight under the previous day.
function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function hhmmToTime(v: string | undefined): Date | null {
  if (!v) return null;
  return new Date(`1970-01-01T${v}:00.000Z`);
}

// A shift time is stored as a plain time-of-day, not a real moment — a 1970-01-01 date whose UTC
// hour/minute/second IS the office's local wall-clock time, matching hhmmToTime() above and every
// display path (timeCell, formatTimeOfDay, isoToTimeInput). A genuine `new Date()` "now" must
// never be written to a shift column directly: as a real UTC instant, it would drift by the
// server's own UTC offset (5:30 for this office) once read back as if it were already local
// time-of-day.
function nowAsAttendanceTime(): Date {
  const now = new Date();
  return new Date(Date.UTC(1970, 0, 1, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()));
}

const punchSchema = z.object({
  shift: z.union([z.literal(1), z.literal(2)]),
  type: z.enum(["IN", "OUT"]),
});

export const punch = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.kind !== "staff") {
    throw new ApiError(403, "Only staff can punch attendance");
  }
  const { shift, type } = punchSchema.parse(req.body);
  const staffId = req.user.id;
  const workDate = startOfTodayUtc();
  const now = nowAsAttendanceTime();

  const existing = await prisma.attendance.findUnique({
    where: { unique_staff_date: { staffId, workDate } },
  });

  const field = `shift${shift}${type === "IN" ? "In" : "Out"}` as
    | "shift1In"
    | "shift1Out"
    | "shift2In"
    | "shift2Out";

  if (existing && existing[field]) {
    throw new ApiError(409, `Shift ${shift} ${type} has already been punched today`);
  }

  const merged = {
    shift1In: existing?.shift1In ?? null,
    shift1Out: existing?.shift1Out ?? null,
    shift2In: existing?.shift2In ?? null,
    shift2Out: existing?.shift2Out ?? null,
    [field]: now,
  };
  const status = computeAttendanceStatus(merged);

  const record = await prisma.attendance.upsert({
    where: { unique_staff_date: { staffId, workDate } },
    create: { staffId, workDate, [field]: now, status },
    update: { [field]: now, status },
  });

  res.json(record);
});

// One-click alternative to punching shift 1 in and shift 1 out separately — covers the common
// case (a single continuous work day, not an actual shift split) with standard office hours,
// for anyone who forgot to punch at the actual start of day or simply doesn't want to.
export const markFullDay = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.kind !== "staff") {
    throw new ApiError(403, "Only staff can mark their own attendance");
  }
  const staffId = req.user.id;
  const workDate = startOfTodayUtc();

  const existing = await prisma.attendance.findUnique({
    where: { unique_staff_date: { staffId, workDate } },
  });
  if (existing?.shift1In || existing?.shift1Out) {
    throw new ApiError(409, "Shift 1 has already been punched today — use the individual punch buttons instead");
  }

  const shift1In = hhmmToTime(FULL_DAY_START_HHMM);
  const shift1Out = hhmmToTime(FULL_DAY_END_HHMM);
  const merged = {
    shift1In,
    shift1Out,
    shift2In: existing?.shift2In ?? null,
    shift2Out: existing?.shift2Out ?? null,
  };
  const status = computeAttendanceStatus(merged);

  const record = await prisma.attendance.upsert({
    where: { unique_staff_date: { staffId, workDate } },
    create: { staffId, workDate, shift1In, shift1Out, status },
    update: { shift1In, shift1Out, status },
  });

  res.json(record);
});

const overrideSchema = z.object({
  shift1In: z.string().datetime().nullable().optional(),
  shift1Out: z.string().datetime().nullable().optional(),
  shift2In: z.string().datetime().nullable().optional(),
  shift2Out: z.string().datetime().nullable().optional(),
  overrideNote: z.string().min(1, "A reason is required to override attendance"),
});

export const adminOverride = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const input = overrideSchema.parse(req.body);

  const existing = await prisma.attendance.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Attendance record not found");

  const merged = {
    shift1In: input.shift1In !== undefined ? (input.shift1In ? new Date(input.shift1In) : null) : existing.shift1In,
    shift1Out: input.shift1Out !== undefined ? (input.shift1Out ? new Date(input.shift1Out) : null) : existing.shift1Out,
    shift2In: input.shift2In !== undefined ? (input.shift2In ? new Date(input.shift2In) : null) : existing.shift2In,
    shift2Out: input.shift2Out !== undefined ? (input.shift2Out ? new Date(input.shift2Out) : null) : existing.shift2Out,
  };
  const status = computeAttendanceStatus(merged);

  const record = await prisma.attendance.update({
    where: { id },
    data: {
      ...merged,
      status,
      overrideNote: input.overrideNote,
      overriddenById: req.user!.kind === "staff" ? req.user!.id : null,
    },
  });
  await logAudit(req, {
    action: "ATTENDANCE_OVERRIDE",
    entityType: "attendance",
    entityId: id,
    meta: { note: input.overrideNote, staffId: existing.staffId },
  });

  res.json(record);
});

// Admin marks (creates or replaces) an attendance record for any staff member / date —
// e.g. logging attendance for someone who forgot to punch. The staff member sees it
// read-only in their views.
const markSchema = z.object({
  staffId: z.number().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  shift1In: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).or(z.literal("")).optional(),
  shift1Out: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).or(z.literal("")).optional(),
  shift2In: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).or(z.literal("")).optional(),
  shift2Out: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).or(z.literal("")).optional(),
  status: z.enum(["PRESENT", "HALF_DAY", "ABSENT", "OVERTIME"]).optional(),
  note: z.string().min(1, "A note is required when an admin marks attendance"),
});

export const adminMark = asyncHandler(async (req: Request, res: Response) => {
  const input = markSchema.parse(req.body);
  const staff = await prisma.staff.findUnique({ where: { id: input.staffId } });
  if (!staff) throw new ApiError(404, "Staff member not found");

  const workDate = new Date(`${input.date}T00:00:00.000Z`);
  if (workDate > startOfTodayUtc()) {
    throw new ApiError(400, "Cannot mark attendance for a future date");
  }
  const shifts = {
    shift1In: hhmmToTime(input.shift1In),
    shift1Out: hhmmToTime(input.shift1Out),
    shift2In: hhmmToTime(input.shift2In),
    shift2Out: hhmmToTime(input.shift2Out),
  };
  const status = input.status ?? computeAttendanceStatus(shifts);

  const record = await prisma.attendance.upsert({
    where: { unique_staff_date: { staffId: input.staffId, workDate } },
    create: {
      staffId: input.staffId,
      workDate,
      ...shifts,
      status,
      overrideNote: input.note,
      overriddenById: req.user?.kind === "staff" ? req.user.id : null,
    },
    update: {
      ...shifts,
      status,
      overrideNote: input.note,
      overriddenById: req.user?.kind === "staff" ? req.user.id : null,
    },
  });
  await logAudit(req, {
    action: "ATTENDANCE_MARKED_BY_ADMIN",
    entityType: "attendance",
    entityId: record.id,
    meta: { staffId: input.staffId, date: input.date, note: input.note },
  });

  res.json(record);
});

const monthlyQuerySchema = z.object({
  staffId: z.coerce.number().int(),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000),
});

export const monthlyReport = asyncHandler(async (req: Request, res: Response) => {
  const { staffId, month, year } = monthlyQuerySchema.parse(req.query);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const records = await prisma.attendance.findMany({
    where: { staffId, workDate: { gte: start, lt: end } },
    orderBy: { workDate: "asc" },
  });

  const totalMinutes = records.reduce((sum, r) => sum + totalWorkedMinutes(r), 0);
  const summary = {
    PRESENT: 0,
    HALF_DAY: 0,
    ABSENT: 0,
    OVERTIME: 0,
  };
  for (const r of records) summary[r.status] += 1;

  res.json({
    staffId,
    month,
    year,
    totalHours: Math.round((totalMinutes / 60) * 100) / 100,
    summary,
    records,
  });
});

const dailyQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});

export const listByDate = asyncHandler(async (req: Request, res: Response) => {
  const { date } = dailyQuerySchema.parse(req.query);
  const workDate = new Date(`${date}T00:00:00.000Z`);

  const records = await prisma.attendance.findMany({
    where: { workDate },
    include: { staff: { select: { id: true, fullName: true } } },
    orderBy: { staff: { fullName: "asc" } },
  });

  res.json(records);
});

type AttendanceRow = {
  workDate: Date;
  staff?: { fullName: string } | null;
  shift1In: Date | null;
  shift1Out: Date | null;
  shift2In: Date | null;
  shift2Out: Date | null;
  status: string;
  overrideNote: string | null;
};

/** "7h 30m" — the actual productive time for the day, not just the raw punch times. Shows the
 * real cost of a mid-day/partial-day departure (a shift that closed out early, or a second shift
 * that never started) without the reader having to do the subtraction themselves. */
function workedHoursCell(r: AttendanceRow): string {
  const minutes = totalWorkedMinutes(r);
  if (minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}

function attendanceColumns(withStaff: boolean): ExportColumn<AttendanceRow>[] {
  const cols: ExportColumn<AttendanceRow>[] = [];
  if (withStaff) cols.push({ header: "Staff", value: (r) => r.staff?.fullName ?? "" });
  cols.push(
    { header: "Date", value: (r) => r.workDate.toISOString().slice(0, 10) },
    { header: "Shift 1 In", value: (r) => timeCell(r.shift1In) },
    { header: "Shift 1 Out", value: (r) => timeCell(r.shift1Out) },
    { header: "Shift 2 In", value: (r) => timeCell(r.shift2In) },
    { header: "Shift 2 Out", value: (r) => timeCell(r.shift2Out) },
    { header: "Worked Hours", value: workedHoursCell },
    { header: "Status", value: (r) => r.status },
    { header: "Override Note", value: (r) => r.overrideNote ?? "" }
  );
  return cols;
}

export const exportMonthly = asyncHandler(async (req: Request, res: Response) => {
  const { staffId, month, year } = monthlyQuerySchema.parse(req.query);
  const format = req.query.format === "pdf" ? "pdf" : "xlsx";
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const staff = await prisma.staff.findUnique({ where: { id: staffId } });
  const records = await prisma.attendance.findMany({
    where: { staffId, workDate: { gte: start, lt: end } },
    orderBy: { workDate: "asc" },
  });

  const columns = attendanceColumns(false);
  const title = `Attendance — ${staff?.fullName ?? `Staff #${staffId}`} — ${month}/${year}`;
  const name = `attendance-${staffId}-${year}-${String(month).padStart(2, "0")}`;
  if (format === "pdf") {
    exportPdf(res, name, title, columns, records);
  } else {
    await exportXlsx(res, name, columns, records);
  }
});

export const exportDaily = asyncHandler(async (req: Request, res: Response) => {
  const { date } = dailyQuerySchema.parse(req.query);
  const format = req.query.format === "pdf" ? "pdf" : "xlsx";
  const workDate = new Date(`${date}T00:00:00.000Z`);

  const records = await prisma.attendance.findMany({
    where: { workDate },
    include: { staff: { select: { id: true, fullName: true } } },
    orderBy: { staff: { fullName: "asc" } },
  });

  const columns = attendanceColumns(true);
  if (format === "pdf") {
    exportPdf(res, `attendance-${date}`, `Team Attendance — ${date}`, columns, records);
  } else {
    await exportXlsx(res, `attendance-${date}`, columns, records);
  }
});
