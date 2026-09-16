import { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { computeDailyActivity, todayYmdLocal } from "../../utils/dailyActivity";

function tally(rows: Array<{ status: string; _count: number }>): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = r._count;
    return acc;
  }, {});
}

// Attendance.workDate is a plain @db.Date column (no time component) keyed by local calendar
// date — same construction attendance.controller.ts's startOfTodayUtc() uses: local Y/M/D
// wrapped as a UTC-midnight Date, which is how Prisma expects a DATE column's value, not a
// gte/lte range (that's for full-timestamp columns like createdAt — see utils/dateRange.ts).
function todayAsDateColumn(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export const getDashboard = asyncHandler(async (_req: Request, res: Response) => {
  const today = todayYmdLocal();

  const [
    panByStatus,
    panCredits,
    tanByStatus,
    tanCredits,
    queriesByStatus,
    agentsActive,
    agentsInactive,
    attendanceToday,
    dailyActivity,
  ] = await Promise.all([
    prisma.panApplication.groupBy({ by: ["status"], _count: true }),
    prisma.panApplication.count({ where: { adjustmentAvailable: true } }),
    prisma.tanApplication.groupBy({ by: ["status"], _count: true }),
    prisma.tanApplication.count({ where: { adjustmentAvailable: true } }),
    prisma.clientQuery.groupBy({ by: ["status"], _count: true }),
    prisma.agent.count({ where: { isActive: true } }),
    prisma.agent.count({ where: { isActive: false } }),
    prisma.attendance.groupBy({ by: ["status"], where: { workDate: todayAsDateColumn() }, _count: true }),
    computeDailyActivity(today),
  ]);

  res.json({
    pan: { ...tally(panByStatus), feeCreditsAvailable: panCredits },
    tan: { ...tally(tanByStatus), feeCreditsAvailable: tanCredits },
    queries: tally(queriesByStatus),
    agents: { active: agentsActive, inactive: agentsInactive },
    attendanceToday: tally(attendanceToday),
    today: dailyActivity,
  });
});
