import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { logAudit } from "../../utils/audit";
import { sendMail } from "../../utils/mailer";
import { ymdToDdMmYyyy } from "../../utils/date";
import { buildDayEndReportPdf, buildRangeReportPdf, buildRangeReportXlsx } from "./report.service";

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Generates the day-end PDF and emails it to every configured recipient. Returns a summary.
 * Shared by the manual "Send now" button and the scheduled job.
 */
export async function runDayEndReport(
  dateYmd: string,
  actor: { kind: "staff" | "system"; id?: number; name?: string }
): Promise<{ date: string; recipients: string[]; skipped: string[] }> {
  const recipientRows = await prisma.dayEndReportRecipient.findMany({
    include: { staff: { select: { id: true, fullName: true, email: true } } },
  });

  const { buffer, label } = await buildDayEndReportPdf(dateYmd);

  const sent: string[] = [];
  const skipped: string[] = [];
  for (const r of recipientRows) {
    if (!r.staff.email) {
      skipped.push(`${r.staff.fullName} (no email)`);
      continue;
    }
    await sendMail({
      to: r.staff.email,
      subject: `Day-End Report — ${label}`,
      text: `Attached is the day-end activity report for ${label}, covering PAN, TAN, attendance, client queries and the inward/outward register.`,
      attachments: [{ filename: `Day-End-Report-as-on-${ymdToDdMmYyyy(dateYmd)}.pdf`, content: buffer, contentType: "application/pdf" }],
    });
    sent.push(r.staff.email);
  }

  await logAudit(null, {
    action: "DAY_END_REPORT_SENT",
    entityType: "app_config",
    entityId: 1,
    meta: { date: dateYmd, sent, skipped },
    actor,
  });

  return { date: dateYmd, recipients: sent, skipped };
}

const sendSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

export const sendNow = asyncHandler(async (req: Request, res: Response) => {
  const { date } = sendSchema.parse(req.body ?? {});
  const recipientCount = await prisma.dayEndReportRecipient.count();
  if (recipientCount === 0) {
    throw new ApiError(400, "No day-end report recipients are configured (Settings → Email).");
  }
  const result = await runDayEndReport(
    date ?? todayYmd(),
    req.user?.kind === "staff" ? { kind: "staff", id: req.user.id } : { kind: "system" }
  );
  res.json(result);
});

export const previewReport = asyncHandler(async (req: Request, res: Response) => {
  const date = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : todayYmd();
  const { buffer } = await buildDayEndReportPdf(date);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="Day-End-Report-as-on-${ymdToDdMmYyyy(date)}.pdf"`);
  res.end(buffer);
});

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** On-demand full report across an arbitrary date range, covering the same modules/sections as
 * the daily email — for when the office wants a week/month view instead of one day at a time.
 * Downloaded directly rather than emailed; not tied to the day-end recipients list. */
export const downloadRangeReport = asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = rangeSchema.parse(req.query);
  if (from > to) throw new ApiError(400, "'From' date must be on or before 'To' date");
  const format = req.query.format === "xlsx" ? "xlsx" : "pdf";

  const rangeLabel = `${ymdToDdMmYyyy(from)}-to-${ymdToDdMmYyyy(to)}`;

  if (format === "xlsx") {
    const buffer = await buildRangeReportXlsx(from, to);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Full-Report-${rangeLabel}.xlsx"`);
    res.end(buffer);
    return;
  }

  const { buffer } = await buildRangeReportPdf(from, to);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Full-Report-${rangeLabel}.pdf"`);
  res.end(buffer);
});
