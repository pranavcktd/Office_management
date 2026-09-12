import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { logAudit } from "../../utils/audit";
import { sendMail } from "../../utils/mailer";
import { buildDayEndReportPdf } from "./report.service";

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
      attachments: [{ filename: `day-end-report-${dateYmd}.pdf`, content: buffer, contentType: "application/pdf" }],
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
  res.setHeader("Content-Disposition", `inline; filename="day-end-report-${date}.pdf"`);
  res.end(buffer);
});
