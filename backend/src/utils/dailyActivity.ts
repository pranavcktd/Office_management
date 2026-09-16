import { prisma } from "../db/prisma";
import { localDateRange } from "./dateRange";

export interface DailyActivity {
  date: string;
  newEntries: { pan: number; tan: number; total: number };
  newRejections: { pan: number; tan: number; total: number };
  adjustmentsMade: { pan: number; tan: number; total: number };
  revenue: { newRevenue: number; adjustedRevenue: number };
  missingEntryAlerts: { pan: number; tan: number; total: number };
}

/** One day's worth of activity across PAN/TAN — reused by the Reports "Daily Activity" tab and
 * the Dashboard's "Today" section so the two never drift out of sync. All counts are entry-date
 * based except newRejections, which is rejection-date based (a form entered last week that gets
 * rejected today is today's rejection, not last week's). */
export async function computeDailyActivity(dateYmd: string): Promise<DailyActivity> {
  const range = localDateRange(dateYmd, dateYmd)!;

  const [panNew, tanNew, panRejectedToday, tanRejectedToday, panAdjustedToday, tanAdjustedToday, panMissing, tanMissing] =
    await Promise.all([
      prisma.panApplication.findMany({ where: { createdAt: range }, select: { feeAmount: true, paymentMode: true } }),
      prisma.tanApplication.findMany({ where: { createdAt: range }, select: { feeAmount: true, paymentMode: true } }),
      prisma.panApplication.count({ where: { rejectionDate: range } }),
      prisma.tanApplication.count({ where: { rejectionDate: range } }),
      prisma.panApplication.count({ where: { paymentMode: "ADJUSTED", createdAt: range } }),
      prisma.tanApplication.count({ where: { paymentMode: "ADJUSTED", createdAt: range } }),
      prisma.panApplication.count({ where: { autoBackfilled: true, createdAt: range } }),
      prisma.tanApplication.count({ where: { autoBackfilled: true, createdAt: range } }),
    ]);

  const sumFee = (rows: { feeAmount: unknown }[]) => rows.reduce((sum, r) => sum + Number(r.feeAmount), 0);
  const isAdjusted = (r: { paymentMode: string }) => r.paymentMode === "ADJUSTED";

  const newRevenue = sumFee([...panNew, ...tanNew].filter((r) => !isAdjusted(r)));
  const adjustedRevenue = sumFee([...panNew, ...tanNew].filter(isAdjusted));

  return {
    date: dateYmd,
    newEntries: { pan: panNew.length, tan: tanNew.length, total: panNew.length + tanNew.length },
    newRejections: { pan: panRejectedToday, tan: tanRejectedToday, total: panRejectedToday + tanRejectedToday },
    adjustmentsMade: { pan: panAdjustedToday, tan: tanAdjustedToday, total: panAdjustedToday + tanAdjustedToday },
    revenue: { newRevenue, adjustedRevenue },
    missingEntryAlerts: { pan: panMissing, tan: tanMissing, total: panMissing + tanMissing },
  };
}

export function todayYmdLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
