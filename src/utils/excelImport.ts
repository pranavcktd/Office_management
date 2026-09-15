import ExcelJS from "exceljs";
import { Readable } from "stream";
import * as XLSX from "xlsx";
import { parseDdMmYyyy } from "./date";
import { ApiError } from "./asyncHandler";

// ExcelJS only reads the modern OOXML .xlsx format — a legacy binary .xls (as older Excel, or
// "Save As" from some government/bank portals, still produces) fails to load. SheetJS (xlsx)
// reads both old and new formats, so a legacy file is parsed with that instead and rebuilt as a
// plain ExcelJS worksheet — everything downstream (findColumnByHeader, parseCellDate, per-cell
// reads) keeps working against the one ExcelJS.Worksheet shape either way.
async function loadLegacyXls(file: Express.Multer.File): Promise<ExcelJS.Worksheet> {
  const parsed = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
  const sheetName = parsed.SheetNames[0];
  if (!sheetName) throw new ApiError(400, "The uploaded file has no worksheets");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(parsed.Sheets[sheetName], { header: 1, raw: true, defval: null });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Sheet1");
  for (const row of rows) worksheet.addRow(row);
  return worksheet;
}

export async function loadWorksheet(file: Express.Multer.File): Promise<ExcelJS.Worksheet> {
  const isCsv = file.mimetype.includes("csv") || /\.csv$/i.test(file.originalname);
  if (isCsv) {
    const workbook = new ExcelJS.Workbook();
    return workbook.csv.read(Readable.from(file.buffer));
  }

  const isLegacyXls = file.mimetype === "application/vnd.ms-excel" || /\.xls$/i.test(file.originalname);
  if (isLegacyXls) {
    return loadLegacyXls(file);
  }

  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs's bundled Buffer type predates modern @types/node's generic Buffer<T>.
    await workbook.xlsx.load(file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    // A file saved with a .xlsx extension but actually in the old binary format (some portals
    // do this) fails ExcelJS's OOXML parser — fall back to SheetJS before giving up.
    return loadLegacyXls(file);
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new ApiError(400, "The uploaded file has no worksheets");
  return worksheet;
}

// Excel/Word/Google Docs "smart quotes" autocorrect a plain ' or " typed (or pasted) into a
// header cell into a curly ’/‘/"/" — a different Unicode character that fails an exact match
// against our template's plain-ASCII headers (e.g. "Father's Name"). Collapsing both to plain
// ASCII before comparing, along with whitespace, makes header matching robust to that.
function normalizeHeaderText(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s+/g, " ");
}

export function findColumnByHeader(headerRow: ExcelJS.Row, headerName: string): number | undefined {
  const target = normalizeHeaderText(headerName);
  let found: number | undefined;
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (!found && normalizeHeaderText(String(cell.value ?? "")) === target) {
      found = colNumber;
    }
  });
  return found;
}

// Some external reports (e.g. Protean's own punching-status export) don't have a fixed header
// vocabulary the way our own templates do — a column like "Date of Birth/Incorporation/Formation"
// can vary in exact wording between report versions. Matching on a known substring instead of an
// exact string tolerates that, at the cost of needing a substring specific enough not to collide
// with a different column (e.g. "date of birth" won't accidentally match "date of discrepancy").
export function findColumnByHeaderContains(headerRow: ExcelJS.Row, substring: string): number | undefined {
  const target = normalizeHeaderText(substring);
  let found: number | undefined;
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (!found && normalizeHeaderText(String(cell.value ?? "")).includes(target)) {
      found = colNumber;
    }
  });
  return found;
}

// Used for admin-configured column fragments (Settings → Protean Report Columns), where the
// saved text is often short and generic (e.g. "date" for a punching-date column that really is
// just the single word "Date"). Trying an exact match first avoids a short fragment like that
// colliding with an unrelated column that merely contains it as a substring (e.g. "Date of
// Birth", "Date of Discrepancy") — falling back to a substring match only when nothing matches
// exactly, for the columns whose real header carries extra text around the configured fragment
// (e.g. "Applicant Last Name/ Surname" for a saved fragment of "applicant last name").
export function findColumnByHeaderFragment(headerRow: ExcelJS.Row, fragment: string): number | undefined {
  return findColumnByHeader(headerRow, fragment) ?? findColumnByHeaderContains(headerRow, fragment);
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
