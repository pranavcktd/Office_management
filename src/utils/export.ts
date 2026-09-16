import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { Response } from "express";

export interface ExportColumn<T> {
  header: string;
  width?: number;
  align?: "left" | "right" | "center";
  value: (row: T) => string;
}

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD0D5DD" } },
  left: { style: "thin", color: { argb: "FFD0D5DD" } },
  bottom: { style: "thin", color: { argb: "FFD0D5DD" } },
  right: { style: "thin", color: { argb: "FFD0D5DD" } },
};

export interface StatBox {
  label: string;
  value: string;
  /** Hex without '#', e.g. "2563EB" (blue), "DC2626" (red), "D97706" (amber), "059669" (green). */
  color: string;
  note?: string;
}

/** Draws a "dashboard card" grid — a big colored number with a label underneath, several per
 * row — so a PDF report reads like the on-screen summary it mirrors instead of a wall of table
 * rows. Returns the Y position immediately below the grid so callers can keep laying out content
 * (e.g. detail tables) beneath it. */
export function drawStatBoxGrid(
  doc: PDFKit.PDFDocument,
  boxes: StatBox[],
  opts: { perRow?: number; boxHeight?: number } = {}
): number {
  const perRow = opts.perRow ?? 3;
  const boxHeight = opts.boxHeight ?? 58;
  const left = doc.page.margins.left;
  const usable = doc.page.width - left - doc.page.margins.right;
  const gap = 10;
  const boxWidth = (usable - gap * (perRow - 1)) / perRow;
  const startY = doc.y;

  boxes.forEach((box, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = left + col * (boxWidth + gap);
    const y = startY + row * (boxHeight + gap);
    doc
      .roundedRect(x, y, boxWidth, boxHeight, 6)
      .fillOpacity(0.1)
      .fillAndStroke(`#${box.color}`, `#${box.color}`)
      .fillOpacity(1);
    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .fillColor(`#${box.color}`)
      .text(box.value, x + 10, y + 8, { width: boxWidth - 20 });
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("#475569")
      .text(box.label, x + 10, y + 30, { width: boxWidth - 20 });
    if (box.note) {
      doc.fontSize(6.5).fillColor("#94a3b8").text(box.note, x + 10, y + 43, { width: boxWidth - 20 });
    }
  });

  const rows = Math.ceil(boxes.length / perRow);
  doc.fillColor("#000000");
  return startY + rows * (boxHeight + gap);
}

export async function exportXlsx<T>(
  res: Response,
  filename: string,
  columns: ExportColumn<T>[],
  rows: T[],
  summaryLines?: string[]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Export");

  sheet.columns = columns.map((c) => ({
    header: c.header,
    // Auto-size from the longer of the header text or its own values, capped to a sane range
    // so one long outlier doesn't blow out the whole sheet.
    width: c.width ?? Math.min(40, Math.max(12, c.header.length + 2, ...rows.map((r) => c.value(r).length + 2))),
  }));

  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = THIN_BORDER;
  });
  headerRow.height = 20;
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const row of rows) {
    const excelRow = sheet.addRow(columns.map((c) => c.value(row)));
    excelRow.eachCell((cell, colNumber) => {
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: "middle", horizontal: columns[colNumber - 1]?.align ?? "left" };
    });
  }

  const totalRow = sheet.addRow([`Total Records: ${rows.length}`]);
  totalRow.getCell(1).font = { bold: true };
  sheet.mergeCells(totalRow.number, 1, totalRow.number, columns.length);

  for (const line of summaryLines ?? []) {
    const summaryRow = sheet.addRow([line]);
    summaryRow.getCell(1).font = { bold: true };
    sheet.mergeCells(summaryRow.number, 1, summaryRow.number, columns.length);
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

export function exportPdf<T>(
  res: Response,
  filename: string,
  title: string,
  columns: ExportColumn<T>[],
  rows: T[],
  summaryLines?: string[]
): void {
  const doc = new PDFDocument({ margin: 30, size: "A4", layout: "landscape" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.pdf"`);
  doc.pipe(res);

  const left = doc.page.margins.left;
  const usableWidth = doc.page.width - left - doc.page.margins.right;
  const colWidth = usableWidth / columns.length;
  const rowHeight = 18;
  const cellPad = 4;

  doc.fontSize(14).font("Helvetica-Bold").text(title, left, doc.y);
  doc.moveDown(1);

  function drawRowBorders(y: number) {
    columns.forEach((_, i) => {
      doc.rect(left + i * colWidth, y, colWidth, rowHeight).strokeColor("#d0d5dd").lineWidth(0.5).stroke();
    });
  }

  function drawHeader() {
    const y = doc.y;
    doc.rect(left, y, usableWidth, rowHeight).fillColor("#4f46e5").fill();
    doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold");
    columns.forEach((c, i) => {
      doc.text(c.header, left + i * colWidth + cellPad, y + cellPad, { width: colWidth - cellPad * 2, ellipsis: true });
    });
    drawRowBorders(y);
    doc.y = y + rowHeight;
    doc.fillColor("#000000").font("Helvetica");
  }

  drawHeader();

  for (const [idx, row] of rows.entries()) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - rowHeight * 2) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    if (idx % 2 === 1) {
      doc.rect(left, y, usableWidth, rowHeight).fillColor("#f8fafc").fill();
      doc.fillColor("#000000");
    }
    columns.forEach((c, i) => {
      doc.fontSize(8).text(c.value(row), left + i * colWidth + cellPad, y + cellPad, {
        width: colWidth - cellPad * 2,
        align: c.align ?? "left",
        ellipsis: true,
      });
    });
    drawRowBorders(y);
    doc.y = y + rowHeight;
  }

  doc.moveDown(1);
  doc.fontSize(9).font("Helvetica-Bold").text(`Total Records: ${rows.length}`, left, doc.y);
  for (const line of summaryLines ?? []) {
    doc.moveDown(0.3);
    doc.fontSize(9).font("Helvetica-Bold").text(line, left, doc.y);
  }

  doc.end();
}
