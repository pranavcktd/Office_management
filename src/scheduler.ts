import { prisma } from "./db/prisma";
import { runDayEndReport } from "./modules/day-end-report/day-end-report.controller";

let lastFiredMinute = "";

/**
 * Lightweight in-process scheduler: every minute, check whether the configured day-end
 * report time (AppConfig.dayEndReportTime, "HH:MM" server-local) matches now, and if so
 * fire the report once for that minute. No external cron dependency.
 */
export function startScheduler(): void {
  setInterval(async () => {
    try {
      const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
      if (!cfg?.dayEndReportTime) return;

      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      if (hhmm !== cfg.dayEndReportTime) return;

      const minuteKey = `${now.toISOString().slice(0, 16)}`;
      if (minuteKey === lastFiredMinute) return;
      lastFiredMinute = minuteKey;

      const recipients = await prisma.dayEndReportRecipient.count();
      if (recipients === 0) return;

      const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      console.log(`[scheduler] firing day-end report for ${ymd}`);
      const result = await runDayEndReport(ymd, { kind: "system", name: "Scheduler" });
      console.log(`[scheduler] day-end report sent to ${result.recipients.length} recipient(s)`);
    } catch (err) {
      console.error("[scheduler] day-end report tick failed:", err);
    }
  }, 60_000);
}
