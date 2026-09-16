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

// formReceivedDate is a plain @db.Date column, written via parseDdMmYyyy (Date.UTC(y, m-1, d) —
// a pure calendar-date encoding, not a local-timezone instant). Querying it needs that same
// exact encoding, not the {gte,lte} local-timestamp range localDateRange builds for createdAt.
function exactDateKey(dateYmd: string): Date {
  const [y, m, d] = dateYmd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** One day's worth of activity across PAN/TAN — reused by the Reports "Daily Activity" tab and
 * the Dashboard's "Today" section so the two never drift out of sync.
 *
 * Date basis differs deliberately by metric: newEntries is entry-date (createdAt) — it's
 * literally about data-entry throughput. newRejections is rejection-date (when it was actually
 * rejected). Revenue is form-received-date — money changes hands when the form is physically
 * received, not whenever staff happens to key it in (which may be the next day or later), so a
 * late entry's fee still counts toward the day it was actually collected. */
export async function computeDailyActivity(dateYmd: string): Promise<DailyActivity> {
  const range = localDateRange(dateYmd, dateYmd)!;
  const receivedOn = exactDateKey(dateYmd);

  const [
    panNewCount,
    tanNewCount,
    panRejectedToday,
    tanRejectedToday,
    panAdjustedToday,
    tanAdjustedToday,
    panMissing,
    tanMissing,
    panReceivedToday,
    tanReceivedToday,
  ] = await Promise.all([
    prisma.panApplication.count({ where: { createdAt: range } }),
    prisma.tanApplication.count({ where: { createdAt: range } }),
    prisma.panApplication.count({ where: { rejectionDate: range } }),
    prisma.tanApplication.count({ where: { rejectionDate: range } }),
    prisma.panApplication.count({ where: { paymentMode: "ADJUSTED", createdAt: range } }),
    prisma.tanApplication.count({ where: { paymentMode: "ADJUSTED", createdAt: range } }),
    prisma.panApplication.count({ where: { autoBackfilled: true, createdAt: range } }),
    prisma.tanApplication.count({ where: { autoBackfilled: true, createdAt: range } }),
    prisma.panApplication.findMany({ where: { formReceivedDate: receivedOn }, select: { feeAmount: true, paymentMode: true } }),
    prisma.tanApplication.findMany({ where: { formReceivedDate: receivedOn }, select: { feeAmount: true, paymentMode: true } }),
  ]);

  const sumFee = (rows: { feeAmount: unknown }[]) => rows.reduce((sum, r) => sum + Number(r.feeAmount), 0);
  const isAdjusted = (r: { paymentMode: string }) => r.paymentMode === "ADJUSTED";
  const receivedToday = [...panReceivedToday, ...tanReceivedToday];

  const newRevenue = sumFee(receivedToday.filter((r) => !isAdjusted(r)));
  const adjustedRevenue = sumFee(receivedToday.filter(isAdjusted));

  return {
    date: dateYmd,
    newEntries: { pan: panNewCount, tan: tanNewCount, total: panNewCount + tanNewCount },
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
