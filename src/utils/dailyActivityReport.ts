import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { Response } from "express";
import { drawStatBoxGrid } from "./export";
import { ymdToDdMmYyyy } from "./date";
import type { DailyActivity } from "./dailyActivity";

function statsFor(activity: DailyActivity): Array<{ label: string; value: string; color: string; note?: string }> {
  return [
    {
      label: "New Entries (by entry date)",
      value: String(activity.newEntries.total),
      color: "2563EB",
      note: `PAN ${activity.newEntries.pan} · TAN ${activity.newEntries.tan}`,
    },
    {
      label: "New Rejections (by rejection date)",
      value: String(activity.newRejections.total),
      color: "DC2626",
      note: `PAN ${activity.newRejections.pan} · TAN ${activity.newRejections.tan}`,
    },
    {
      label: "Adjustments Made (by entry date)",
      value: String(activity.adjustmentsMade.total),
      color: "D97706",
      note: `PAN ${activity.adjustmentsMade.pan} · TAN ${activity.adjustmentsMade.tan}`,
    },
    {
      label: "New Revenue (by form received date)",
      value: `Rs ${activity.revenue.newRevenue.toFixed(2)}`,
      color: "059669",
      note: "Fresh fees, excludes adjustments",
    },
    {
      label: "Adjusted Revenue (by form received date)",
      value: `Rs ${activity.revenue.adjustedRevenue.toFixed(2)}`,
      color: "D97706",
      note: "Fee collected on credit-adjusted forms",
    },
    {
      label: "Missing Entry Alerts (by entry date)",
      value: String(activity.missingEntryAlerts.total),
      color: activity.missingEntryAlerts.total > 0 ? "DC2626" : "64748B",
      note: `PAN ${activity.missingEntryAlerts.pan} · TAN ${activity.missingEntryAlerts.tan}`,
    },
  ];
}

export function exportDailyActivityPdf(res: Response, activity: DailyActivity): void {
  const label = ymdToDdMmYyyy(activity.date);
  const doc = new PDFDocument({ margin: 30, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Daily-Activity-Report-as-on-${label}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).font("Helvetica-Bold").fillColor("#000000").text(`Daily Activity Report — as on ${label}`, doc.page.margins.left, doc.y);
  doc.moveDown(0.3);
  doc.fontSize(8).font("Helvetica").fillColor("#666").text(`Generated ${new Date().toLocaleString()}`);
  doc.fillColor("#000").moveDown(1);

  drawStatBoxGrid(doc, statsFor(activity), { perRow: 2, boxHeight: 62 });

  doc.end();
}

export async function exportDailyActivityXlsx(res: Response, activity: DailyActivity): Promise<void> {
  const label = ymdToDdMmYyyy(activity.date);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Daily Activity");
  sheet.columns = [
    { header: "Metric", key: "metric", width: 38 },
    { header: "Value", key: "value", width: 20 },
    { header: "Breakdown", key: "note", width: 36 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  });

  const colors: Record<string, string> = {
    "2563EB": "FFDBEAFE",
    DC2626: "FFFEE2E2",
    D97706: "FFFEF3C7",
    "059669": "FFD1FAE5",
    "64748B": "FFF1F5F9",
  };

  for (const stat of statsFor(activity)) {
    const row = sheet.addRow({ metric: stat.label, value: stat.value, note: stat.note ?? "" });
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors[stat.color] ?? "FFFFFFFF" } };
    });
    row.getCell(2).font = { bold: true };
  }

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="Daily-Activity-Report-as-on-${label}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}
