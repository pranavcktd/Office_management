import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { prisma } from "../../db/prisma";
import { totalWorkedMinutes } from "../attendance/attendance.service";
import { drawStatBoxGrid } from "../../utils/export";
import type { StatBox } from "../../utils/export";

function dayBounds(dateYmd: string): { start: Date; end: Date; label: string } {
  // Interpret the date in the server's local timezone (single-office tool).
  const [y, m, d] = dateYmd.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { start, end, label: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}` };
}

interface Section {
  title: string;
  columns: string[];
  rows: string[][];
  footer?: string;
}

async function buildSections(start: Date, end: Date): Promise<{ sections: Section[]; stats: StatBox[] }> {
  const created = { gte: start, lte: end };

  const [pan, tan, attendance, queries, dispatch] = await Promise.all([
    prisma.panApplication.findMany({
      where: { createdAt: created },
      include: { agent: { select: { agentName: true } }, createdBy: { select: { fullName: true } } },
      orderBy: { id: "asc" },
    }),
    prisma.tanApplication.findMany({
      where: { createdAt: created },
      include: { agent: { select: { agentName: true } }, createdBy: { select: { fullName: true } } },
      orderBy: { id: "asc" },
    }),
    prisma.attendance.findMany({
      where: { updatedAt: created },
      include: { staff: { select: { fullName: true } } },
      orderBy: { id: "asc" },
    }),
    prisma.clientQuery.findMany({
      where: { OR: [{ createdAt: created }, { updatedAt: created }] },
      include: { serviceCategory: { select: { name: true } }, assignedTo: { select: { fullName: true } } },
      orderBy: { id: "asc" },
    }),
    prisma.dispatchRegister.findMany({
      where: { createdAt: created },
      include: { itemCategory: { select: { name: true } }, handledBy: { select: { fullName: true } } },
      orderBy: { id: "asc" },
    }),
  ]);

  const time = (v: Date | null) =>
    v ? `${String(new Date(v).getUTCHours()).padStart(2, "0")}:${String(new Date(v).getUTCMinutes()).padStart(2, "0")}` : "";

  const panFee = pan.reduce((sum, r) => sum + Number(r.feeAmount), 0);
  const tanFee = tan.reduce((sum, r) => sum + Number(r.feeAmount), 0);
  const presentCount = attendance.filter((r) => r.status === "PRESENT" || r.status === "OVERTIME").length;

  const stats: StatBox[] = [
    { label: "PAN Applications", value: String(pan.length), color: "2563EB" },
    { label: "TAN Applications", value: String(tan.length), color: "2563EB" },
    { label: "Total Fee (PAN+TAN)", value: `Rs ${(panFee + tanFee).toFixed(2)}`, color: "059669" },
    { label: "Staff Present", value: `${presentCount}/${attendance.length}`, color: "0891B2" },
    { label: "Client Queries", value: String(queries.length), color: "D97706" },
    { label: "Inward/Outward Entries", value: String(dispatch.length), color: "7C3AED" },
  ];

  const sections: Section[] = [
    {
      title: `PAN Applications (${pan.length})`,
      columns: ["ID", "Applicant", "Type", "Source", "Fee", "Status", "Entered By"],
      rows: pan.map((r) => [
        String(r.id),
        r.applicantName,
        r.applicationType,
        r.sourceType === "AGENT" ? r.agent?.agentName ?? "Agent" : "Office",
        String(r.feeAmount),
        r.status,
        r.createdBy?.fullName ?? "",
      ]),
      footer: `Total Fee: ₹${pan.reduce((sum, r) => sum + Number(r.feeAmount), 0).toFixed(2)}`,
    },
    {
      title: `TAN Applications (${tan.length})`,
      columns: ["ID", "Name", "Category", "Source", "Fee", "Status", "Entered By"],
      rows: tan.map((r) => [
        String(r.id),
        r.applicantName,
        r.applicantCategory,
        r.sourceType === "AGENT" ? r.agent?.agentName ?? "Agent" : "Office",
        String(r.feeAmount),
        r.status,
        r.createdBy?.fullName ?? "",
      ]),
      footer: `Total Fee: ₹${tan.reduce((sum, r) => sum + Number(r.feeAmount), 0).toFixed(2)}`,
    },
    {
      title: `Attendance activity (${attendance.length})`,
      columns: ["Staff", "S1 In", "S1 Out", "S2 In", "S2 Out", "Worked Hours", "Status"],
      rows: attendance.map((r) => {
        const minutes = totalWorkedMinutes(r);
        return [
          r.staff?.fullName ?? "",
          time(r.shift1In),
          time(r.shift1Out),
          time(r.shift2In),
          time(r.shift2Out),
          minutes > 0 ? `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m` : "",
          r.status,
        ];
      }),
    },
    {
      title: `Client Queries (${queries.length})`,
      columns: ["ID", "Client", "Service", "Status", "Assigned To"],
      rows: queries.map((r) => [
        String(r.id),
        r.clientName,
        r.serviceCategory?.name ?? "",
        r.status,
        r.assignedTo?.fullName ?? "—",
      ]),
    },
    {
      title: `Inward / Outward Register (${dispatch.length})`,
      columns: ["ID", "Type", "Item", "Courier", "Consignment", "Party", "By"],
      rows: dispatch.map((r) => [
        String(r.id),
        r.entryType,
        r.itemCategory?.name ?? "",
        r.courierAgency ?? "",
        r.consignmentNumber ?? "",
        r.partyDetails.slice(0, 40),
        r.handledBy.fullName,
      ]),
    },
  ];

  return { sections, stats };
}

async function renderReportPdf(sections: Section[], stats: StatBox[], label: string, titlePrefix: string): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 34, size: "A4", layout: "landscape" });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const usable = doc.page.width - left - doc.page.margins.right;

  doc.fontSize(16).font("Helvetica-Bold").text(`${titlePrefix} — ${label}`, left, doc.y);
  doc.moveDown(0.3);
  doc.fontSize(8).font("Helvetica").fillColor("#666").text(`Generated ${new Date().toLocaleString()}`, left, doc.y);
  doc.fillColor("#000").moveDown(1);

  // "At a glance" summary band — the whole point is being readable in one look before anyone
  // has to scroll into the detail tables below.
  doc.y = drawStatBoxGrid(doc, stats, { perRow: 6, boxHeight: 50 }) + 12;

  for (const section of sections) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 60) doc.addPage();
    const titleY = doc.y;
    doc.rect(left, titleY - 2, usable, 16).fill("#eef2ff");
    doc.fillColor("#312e81").fontSize(11).font("Helvetica-Bold").text(section.title, left + 4, titleY);
    doc.fillColor("#000000");
    doc.y = titleY + 18;

    const colW = usable / section.columns.length;
    const header = () => {
      const y = doc.y;
      doc.fontSize(7.5).font("Helvetica-Bold");
      section.columns.forEach((c, i) => doc.text(c, left + i * colW, y, { width: colW - 3, ellipsis: true }));
      doc.moveDown(0.2);
      doc.moveTo(left, doc.y).lineTo(left + usable, doc.y).strokeColor("#ccc").stroke();
      doc.moveDown(0.2);
      doc.font("Helvetica");
    };
    header();

    if (section.rows.length === 0) {
      doc.fontSize(7.5).fillColor("#888").text("— none —", left, doc.y).fillColor("#000");
      doc.moveDown(0.4);
    }
    for (const row of section.rows) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        header();
      }
      const y = doc.y;
      doc.fontSize(7.5);
      row.forEach((cell, i) => doc.text(cell, left + i * colW, y, { width: colW - 3, ellipsis: true }));
      doc.moveDown(0.35);
    }
    if (section.footer) {
      doc.moveDown(0.15);
      doc.fontSize(8).font("Helvetica-Bold").text(section.footer, left, doc.y);
      doc.font("Helvetica");
    }
    doc.moveDown(0.8);
  }

  doc.end();
  return done;
}

export async function buildDayEndReportPdf(dateYmd: string): Promise<{ buffer: Buffer; label: string }> {
  const { start, end, label } = dayBounds(dateYmd);
  const { sections, stats } = await buildSections(start, end);
  const buffer = await renderReportPdf(sections, stats, label, "Day-End Report");
  return { buffer, label };
}

/** On-demand, admin-triggered full report across an arbitrary date range — same modules/sections
 * as the daily email, just not tied to the recipients list or the scheduled send time. */
export async function buildRangeReportPdf(fromYmd: string, toYmd: string): Promise<{ buffer: Buffer; label: string }> {
  const { start } = dayBounds(fromYmd);
  const { end, label: toLabel } = dayBounds(toYmd);
  const label = `${dayBounds(fromYmd).label} to ${toLabel}`;
  const { sections, stats } = await buildSections(start, end);
  const buffer = await renderReportPdf(sections, stats, label, "Full Report");
  return { buffer, label };
}

export async function buildRangeReportXlsx(fromYmd: string, toYmd: string): Promise<Buffer> {
  const { start } = dayBounds(fromYmd);
  const { end } = dayBounds(toYmd);
  const { sections, stats } = await buildSections(start, end);

  const workbook = new ExcelJS.Workbook();

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 18 },
  ];
  summarySheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  summarySheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  });
  for (const stat of stats) {
    const row = summarySheet.addRow({ metric: stat.label, value: stat.value });
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FF" } };
    row.getCell(2).font = { bold: true };
  }

  for (const section of sections) {
    // Sheet names can't exceed 31 chars or contain []:*?/\\ — section titles carry a row count
    // suffix like " (12)" that both risks the length limit and isn't meaningful as a tab name.
    const sheetName = section.title.replace(/\s*\(\d+\)$/, "").replace(/[[\]:*?/\\]/g, "").slice(0, 31);
    const sheet = workbook.addWorksheet(sheetName || "Sheet");
    sheet.addRow(section.columns);
    sheet.getRow(1).font = { bold: true };
    for (const row of section.rows) sheet.addRow(row);
    if (section.footer) {
      const footerRow = sheet.addRow([section.footer]);
      footerRow.getCell(1).font = { bold: true };
      sheet.mergeCells(footerRow.number, 1, footerRow.number, section.columns.length);
    }
    sheet.columns.forEach((col) => {
      let max = 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        max = Math.max(max, String(cell.value ?? "").length + 2);
      });
      col.width = Math.min(40, max);
    });
  }

  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
}
