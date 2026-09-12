import ExcelJS from "exceljs";
import { Readable } from "stream";
import { parseDdMmYyyy } from "./date";
import { ApiError } from "./asyncHandler";

export async function loadWorksheet(file: Express.Multer.File): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  const isCsv = file.mimetype.includes("csv") || /\.csv$/i.test(file.originalname);

  if (isCsv) {
    return workbook.csv.read(Readable.from(file.buffer));
  }

  // exceljs's bundled Buffer type predates modern @types/node's generic Buffer<T>.
  await workbook.xlsx.load(file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new ApiError(400, "The uploaded file has no worksheets");
  return worksheet;
}

export function findColumnByHeader(headerRow: ExcelJS.Row, headerName: string): number | undefined {
  const target = headerName.trim().toLowerCase();
  let found: number | undefined;
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (!found && String(cell.value ?? "").trim().toLowerCase() === target) {
      found = colNumber;
    }
  });
  return found;
}

export function parseCellDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value === "string" && value.trim()) {
    try {
      return parseDdMmYyyy(value.trim());
    } catch {
      return null;
    }
  }
  return null;
}
