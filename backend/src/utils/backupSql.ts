import { Prisma } from "@prisma/client";
import type { BackupPayload } from "./backupService";

// Maps each BackupPayload.tables key to its Prisma model name, so column names (and the real DB
// table name) can be read straight from Prisma's own DMMF metadata instead of hand-maintaining a
// second copy of every @map(...) in this schema — that second copy would silently drift out of
// sync the next time a field is renamed or a table is added.
const MODEL_BY_TABLE_KEY: Record<keyof BackupPayload["tables"], string> = {
  staff: "Staff",
  agents: "Agent",
  agentEmails: "AgentEmail",
  agentNotifications: "AgentNotification",
  masterCategories: "MasterCategory",
  appConfig: "AppConfig",
  feeScheduleDefaults: "FeeScheduleDefault",
  fieldRequirements: "FieldRequirement",
  proteanReportMappings: "ProteanReportMapping",
  attendance: "Attendance",
  panApplications: "PanApplication",
  tanApplications: "TanApplication",
  dispatchRegister: "DispatchRegister",
  clientQueries: "ClientQuery",
  queryUpdates: "QueryUpdate",
  dayEndReportRecipients: "DayEndReportRecipient",
  documents: "Document",
  agentFeeRates: "AgentFeeRate",
  staffLedgerEntries: "StaffLedgerEntry",
  trackingLinks: "TrackingLink",
};

// Same dependency order restoreFullBackup() creates parents before children in — see that
// function's comments for why (FKs). Deletes run in the exact reverse order.
const TABLE_ORDER: (keyof BackupPayload["tables"])[] = [
  "staff",
  "agents",
  "agentEmails",
  "agentNotifications",
  "masterCategories",
  "appConfig",
  "feeScheduleDefaults",
  "fieldRequirements",
  "proteanReportMappings",
  "attendance",
  "panApplications",
  "tanApplications",
  "dispatchRegister",
  "clientQueries",
  "queryUpdates",
  "dayEndReportRecipients",
  "documents",
  "agentFeeRates",
  "staffLedgerEntries",
  "trackingLinks",
];

interface ColumnMeta {
  field: string;
  column: string;
  isList: boolean;
  isJson: boolean;
  isTimeOnly: boolean;
}

// DMMF doesn't expose a field's @db.Time()/@db.Date() native-type attribute (only its base
// DateTime type), so the handful of genuinely time-only columns are named explicitly here —
// Attendance's four shift columns are the only ones in this schema. Written as a plain "HH:MM:SS"
// literal (never a full ISO datetime) since that's what a TIME column's input parser accepts;
// getUTCHours/Minutes/Seconds is deliberate — see attendance.controller.ts's
// nowAsAttendanceTime()/hhmmToTime(): these values are stored with their UTC hour/minute AS the
// office's local wall-clock time, not a real UTC instant, so reading them back the same way is
// what keeps the punch time correct.
const TIME_ONLY_FIELDS = new Set(["Attendance.shift1In", "Attendance.shift1Out", "Attendance.shift2In", "Attendance.shift2Out"]);

function modelMeta(modelName: string): { table: string; columns: ColumnMeta[] } {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === modelName);
  if (!model) throw new Error(`Unknown Prisma model for backup SQL export: ${modelName}`);
  const columns = model.fields
    .filter((f) => f.kind === "scalar" || f.kind === "enum")
    .map((f) => ({
      field: f.name,
      column: f.dbName ?? f.name,
      isList: f.isList,
      isJson: f.type === "Json",
      isTimeOnly: TIME_ONLY_FIELDS.has(`${modelName}.${f.name}`),
    }));
  return { table: model.dbName ?? modelName, columns };
}

function quoteIdent(name: string): string {
  return `"${name}"`;
}

function quoteString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function isDecimalLike(v: unknown): v is { toString(): string } {
  return typeof v === "object" && v !== null && typeof (v as { toFixed?: unknown }).toFixed === "function";
}

function sqlLiteral(value: unknown, col: ColumnMeta): string {
  if (value === null || value === undefined) return "NULL";
  if (col.isList) {
    const arr = value as unknown[];
    if (!Array.isArray(arr) || arr.length === 0) return "'{}'";
    return `ARRAY[${arr.map((v) => quoteString(String(v))).join(", ")}]`;
  }
  if (col.isJson) {
    return `${quoteString(JSON.stringify(value))}::jsonb`;
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  if (value instanceof Date) {
    if (col.isTimeOnly) {
      const hh = String(value.getUTCHours()).padStart(2, "0");
      const mm = String(value.getUTCMinutes()).padStart(2, "0");
      const ss = String(value.getUTCSeconds()).padStart(2, "0");
      return quoteString(`${hh}:${mm}:${ss}`);
    }
    return quoteString(value.toISOString());
  }
  if (isDecimalLike(value)) return value.toString();
  return quoteString(String(value));
}

function insertStatementsFor(tableKey: keyof BackupPayload["tables"], rows: unknown[], forceNullFields: string[] = []): string {
  if (rows.length === 0) return "";
  const { table, columns } = modelMeta(MODEL_BY_TABLE_KEY[tableKey]);
  const sample = rows[0] as Record<string, unknown>;
  const presentColumns = columns.filter((c) => c.field in sample);
  const columnList = presentColumns.map((c) => quoteIdent(c.column)).join(", ");
  const lines = rows.map((row) => {
    const r = row as Record<string, unknown>;
    const values = presentColumns.map((c) => (forceNullFields.includes(c.field) ? "NULL" : sqlLiteral(r[c.field], c)));
    return `INSERT INTO ${quoteIdent(table)} (${columnList}) VALUES (${values.join(", ")});`;
  });
  return lines.join("\n");
}

/** Plain SQL (INSERT statements, no schema/DDL) covering the exact same data as the JSON/XLSX
 * backup — for restoring outside this app: `psql` against a fresh database whose schema was
 * already created via `prisma migrate deploy`/`db push` (e.g. moving to a new Railway Postgres
 * instance), or handing to a DBA. This app's own restore flow only accepts the JSON file (see
 * backup.controller.ts) — running arbitrary uploaded SQL against the database is a much bigger
 * security surface than this feature is meant to open up, so this file is for external use only.
 *
 * Self-contained and safe to re-run: deletes every row in dependency order before inserting
 * (mirroring restoreFullBackup's own delete-then-recreate), all inside one transaction, with
 * PAN/TAN's self-referential adjustedFromFormId patched in a second pass once every row exists —
 * the same reason restoreFullBackup does that. */
export function buildBackupSql(payload: BackupPayload): string {
  const lines: string[] = [];
  lines.push(`-- Office Management Portal — data-only SQL export`);
  lines.push(`-- Exported: ${payload.exportedAt}`);
  lines.push(`-- Run against a database whose schema already matches this app's Prisma schema`);
  lines.push(`-- (e.g. after "npx prisma db push" / "npx prisma migrate deploy" on a fresh database).`);
  lines.push("");
  lines.push("BEGIN;");
  lines.push("");

  lines.push("-- Clear existing data (children before parents) so this script is safe to re-run.");
  for (const key of [...TABLE_ORDER].reverse()) {
    const { table } = modelMeta(MODEL_BY_TABLE_KEY[key]);
    if (key === "panApplications" || key === "tanApplications") {
      lines.push(`UPDATE ${quoteIdent(table)} SET "adjusted_from_form_id" = NULL;`);
    }
    lines.push(`DELETE FROM ${quoteIdent(table)};`);
  }
  lines.push("");

  for (const key of TABLE_ORDER) {
    const rows = payload.tables[key] as unknown[];
    if (rows.length === 0) continue;
    // Self-referential adjustedFromFormId is nulled on this first insert and patched in the
    // second pass below, once every row exists — same reason restoreFullBackup() does it.
    const forceNullFields = key === "panApplications" || key === "tanApplications" ? ["adjustedFromFormId"] : [];
    lines.push(`-- ${key} (${rows.length} row${rows.length === 1 ? "" : "s"})`);
    lines.push(insertStatementsFor(key, rows, forceNullFields));
    lines.push("");
  }

  // Second pass: PAN/TAN's self-referential link, stripped above/on insert, patched back in now
  // that every row exists.
  for (const key of ["panApplications", "tanApplications"] as const) {
    const { table } = modelMeta(MODEL_BY_TABLE_KEY[key]);
    const rows = payload.tables[key] as Array<Record<string, unknown>>;
    const withLink = rows.filter((r) => r.adjustedFromFormId != null);
    if (withLink.length === 0) continue;
    lines.push(`-- ${key}: restore adjustedFromFormId links`);
    for (const r of withLink) {
      lines.push(`UPDATE ${quoteIdent(table)} SET "adjusted_from_form_id" = ${Number(r.adjustedFromFormId)} WHERE "id" = ${Number(r.id)};`);
    }
    lines.push("");
  }

  lines.push("-- Fix auto-increment sequences after the explicit-id inserts above.");
  for (const key of TABLE_ORDER) {
    const { table } = modelMeta(MODEL_BY_TABLE_KEY[key]);
    lines.push(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${quoteIdent(table)}), 1));`
    );
  }
  lines.push("");
  lines.push("COMMIT;");

  return lines.join("\n");
}
