import { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { asyncHandler } from "../../utils/asyncHandler";

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function tally(rows: Array<{ status: string; _count: number }>): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = r._count;
    return acc;
  }, {});
}

export const getDashboard = asyncHandler(async (_req: Request, res: Response) => {
  const today = startOfTodayUtc();

  const [
    panByStatus,
    panCredits,
    tanByStatus,
    tanCredits,
    queriesByStatus,
    agentsActive,
    agentsInactive,
    attendanceToday,
  ] = await Promise.all([
    prisma.panApplication.groupBy({ by: ["status"], _count: true }),
    prisma.panApplication.count({ where: { adjustmentAvailable: true } }),
    prisma.tanApplication.groupBy({ by: ["status"], _count: true }),
    prisma.tanApplication.count({ where: { adjustmentAvailable: true } }),
    prisma.clientQuery.groupBy({ by: ["status"], _count: true }),
    prisma.agent.count({ where: { isActive: true } }),
    prisma.agent.count({ where: { isActive: false } }),
    prisma.attendance.groupBy({ by: ["status"], where: { workDate: today }, _count: true }),
  ]);

  res.json({
    pan: { ...tally(panByStatus), feeCreditsAvailable: panCredits },
    tan: { ...tally(tanByStatus), feeCreditsAvailable: tanCredits },
    queries: tally(queriesByStatus),
    agents: { active: agentsActive, inactive: agentsInactive },
    attendanceToday: tally(attendanceToday),
  });
});
