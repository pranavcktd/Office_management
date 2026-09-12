import PDFDocument from "pdfkit";
import { prisma } from "../../db/prisma";

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
}

async function buildSections(start: Date, end: Date): Promise<Section[]> {
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

  return [
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
    },
    {
      title: `Attendance activity (${attendance.length})`,
      columns: ["Staff", "S1 In", "S1 Out", "S2 In", "S2 Out", "Status"],
      rows: attendance.map((r) => [
        r.staff?.fullName ?? "",
        time(r.shift1In),
        time(r.shift1Out),
        time(r.shift2In),
        time(r.shift2Out),
        r.status,
      ]),
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
}

export async function buildDayEndReportPdf(dateYmd: string): Promise<{ buffer: Buffer; label: string }> {
  const { start, end, label } = dayBounds(dateYmd);
  const sections = await buildSections(start, end);

  const doc = new PDFDocument({ margin: 34, size: "A4", layout: "landscape" });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const usable = doc.page.width - left - doc.page.margins.right;

  doc.fontSize(16).font("Helvetica-Bold").text(`Day-End Report — ${label}`, left, doc.y);
  doc.moveDown(0.3);
  doc.fontSize(8).font("Helvetica").fillColor("#666").text(`Generated ${new Date().toLocaleString()}`, left, doc.y);
  doc.fillColor("#000").moveDown(1);

  for (const section of sections) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 60) doc.addPage();
    doc.fontSize(11).font("Helvetica-Bold").text(section.title, left, doc.y);
    doc.moveDown(0.4);

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
    doc.moveDown(0.8);
  }

  doc.end();
  const buffer = await done;
  return { buffer, label };
}
