import ExcelJS from "exceljs";
import { prisma } from "../db/prisma";
import { decryptAadhaar } from "./crypto";

// Session (transient login tokens) and AuditLog (large, purely historical) are deliberately
// excluded from backup/restore — restoring old sessions would resurrect stale logins, and the
// audit trail isn't needed to reconstruct working office data.
export const BACKUP_VERSION = 1;

export interface BackupPayload {
  version: number;
  exportedAt: string;
  tables: {
    staff: unknown[];
    agents: unknown[];
    masterCategories: unknown[];
    appConfig: unknown[];
    feeScheduleDefaults: unknown[];
    fieldRequirements: unknown[];
    ackImportMappings: unknown[];
    attendance: unknown[];
    panApplications: unknown[];
    tanApplications: unknown[];
    dispatchRegister: unknown[];
    clientQueries: unknown[];
    dayEndReportRecipients: unknown[];
    documents: unknown[];
    agentFeeRates: unknown[];
  };
}

export async function createFullBackup(): Promise<BackupPayload> {
  const [
    staff,
    agents,
    masterCategories,
    appConfig,
    feeScheduleDefaults,
    fieldRequirements,
    ackImportMappings,
    attendance,
    panApplications,
    tanApplications,
    dispatchRegister,
    clientQueries,
    dayEndReportRecipients,
    documents,
    agentFeeRates,
  ] = await Promise.all([
    prisma.staff.findMany({ orderBy: { id: "asc" } }),
    prisma.agent.findMany({ orderBy: { id: "asc" } }),
    prisma.masterCategory.findMany({ orderBy: { id: "asc" } }),
    prisma.appConfig.findMany({ orderBy: { id: "asc" } }),
    prisma.feeScheduleDefault.findMany({ orderBy: { id: "asc" } }),
    prisma.fieldRequirement.findMany({ orderBy: { id: "asc" } }),
    prisma.ackImportMapping.findMany({ orderBy: { id: "asc" } }),
    prisma.attendance.findMany({ orderBy: { id: "asc" } }),
    prisma.panApplication.findMany({ orderBy: { id: "asc" } }),
    prisma.tanApplication.findMany({ orderBy: { id: "asc" } }),
    prisma.dispatchRegister.findMany({ orderBy: { id: "asc" } }),
    prisma.clientQuery.findMany({ orderBy: { id: "asc" } }),
    prisma.dayEndReportRecipient.findMany({ orderBy: { id: "asc" } }),
    prisma.document.findMany({ orderBy: { id: "asc" } }),
    prisma.agentFeeRate.findMany({ orderBy: { id: "asc" } }),
  ]);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables: {
      staff,
      agents,
      masterCategories,
      appConfig,
      feeScheduleDefaults,
      fieldRequirements,
      ackImportMappings,
      attendance,
      panApplications,
      tanApplications,
      dispatchRegister,
      clientQueries,
      dayEndReportRecipients,
      documents,
      agentFeeRates,
    },
  };
}

// Converts ISO date strings on specific fields back into real Date objects — JSON round-trips
// every Date as a string, but Prisma Client's create/createMany calls expect actual Date
// instances for DateTime columns.
function reviveDates<T extends Record<string, unknown>>(rows: T[], fields: string[]): T[] {
  return rows.map((row) => {
    const copy = { ...row };
    for (const field of fields) {
      const value = copy[field];
      if (typeof value === "string") {
        (copy as Record<string, unknown>)[field] = new Date(value);
      }
    }
    return copy;
  });
}

async function resetSequence(table: string) {
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1))`
  );
}

/**
 * Wipes every table this backup covers and reloads it from the payload, inside one transaction
 * (all-or-nothing). Session and AuditLog are untouched — see the note at the top of this file.
 */
export async function restoreFullBackup(payload: BackupPayload): Promise<void> {
  if (payload.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version ${payload.version} (expected ${BACKUP_VERSION})`);
  }
  const t = payload.tables;

  await prisma.$transaction(
    async (tx) => {
      // Delete children before parents.
      await tx.agentFeeRate.deleteMany({});
      await tx.document.deleteMany({});
      await tx.dayEndReportRecipient.deleteMany({});
      await tx.clientQuery.deleteMany({});
      await tx.dispatchRegister.deleteMany({});
      await tx.panApplication.updateMany({ data: { adjustedFromFormId: null } }).catch(() => undefined);
      await tx.tanApplication.updateMany({ data: { adjustedFromFormId: null } }).catch(() => undefined);
      await tx.tanApplication.deleteMany({});
      await tx.panApplication.deleteMany({});
      await tx.attendance.deleteMany({});
      await tx.ackImportMapping.deleteMany({});
      await tx.fieldRequirement.deleteMany({});
      await tx.feeScheduleDefault.deleteMany({});
      await tx.appConfig.deleteMany({});
      await tx.masterCategory.deleteMany({});
      await tx.agent.deleteMany({});
      await tx.staff.deleteMany({});

      // Recreate parents before children. PAN/TAN self-referential adjustedFromFormId is
      // stripped on first insert and patched in a second pass once every row exists.
      if (t.staff.length) await tx.staff.createMany({ data: reviveDates(t.staff as never[], ["createdAt", "pendingPasswordExpiresAt", "lastLoginAt"]) });
      if (t.agents.length) await tx.agent.createMany({ data: reviveDates(t.agents as never[], ["createdAt", "pendingPasswordExpiresAt", "lastLoginAt"]) });
      if (t.masterCategories.length) await tx.masterCategory.createMany({ data: reviveDates(t.masterCategories as never[], ["createdAt"]) });
      if (t.appConfig.length) await tx.appConfig.createMany({ data: reviveDates(t.appConfig as never[], ["updatedAt"]) });
      if (t.feeScheduleDefaults.length) await tx.feeScheduleDefault.createMany({ data: reviveDates(t.feeScheduleDefaults as never[], ["updatedAt"]) });
      if (t.fieldRequirements.length) await tx.fieldRequirement.createMany({ data: reviveDates(t.fieldRequirements as never[], ["updatedAt"]) });
      if (t.ackImportMappings.length) await tx.ackImportMapping.createMany({ data: reviveDates(t.ackImportMappings as never[], ["updatedAt"]) });
      if (t.attendance.length) await tx.attendance.createMany({ data: reviveDates(t.attendance as never[], ["workDate", "shift1In", "shift1Out", "shift2In", "shift2Out", "createdAt", "updatedAt"]) });

      const panRows = reviveDates(t.panApplications as never[], ["dob", "rejectionDate", "adjustmentExpiredAt", "formReceivedDate", "createdAt", "updatedAt"]) as Array<Record<string, unknown>>;
      if (panRows.length) {
        await tx.panApplication.createMany({ data: panRows.map((r) => ({ ...r, adjustedFromFormId: null })) as never[] });
        for (const r of panRows) {
          if (r.adjustedFromFormId != null) {
            await tx.panApplication.update({ where: { id: r.id as number }, data: { adjustedFromFormId: r.adjustedFromFormId as number } });
          }
        }
      }

      const tanRows = reviveDates(t.tanApplications as never[], ["dob", "rejectionDate", "adjustmentExpiredAt", "formReceivedDate", "createdAt", "updatedAt"]) as Array<Record<string, unknown>>;
      if (tanRows.length) {
        await tx.tanApplication.createMany({ data: tanRows.map((r) => ({ ...r, adjustedFromFormId: null })) as never[] });
        for (const r of tanRows) {
          if (r.adjustedFromFormId != null) {
            await tx.tanApplication.update({ where: { id: r.id as number }, data: { adjustedFromFormId: r.adjustedFromFormId as number } });
          }
        }
      }

      if (t.dispatchRegister.length) await tx.dispatchRegister.createMany({ data: reviveDates(t.dispatchRegister as never[], ["createdAt"]) });
      if (t.clientQueries.length) await tx.clientQuery.createMany({ data: reviveDates(t.clientQueries as never[], ["createdAt", "updatedAt"]) });
      if (t.dayEndReportRecipients.length) await tx.dayEndReportRecipient.createMany({ data: t.dayEndReportRecipients as never[] });
      if (t.documents.length) await tx.document.createMany({ data: reviveDates(t.documents as never[], ["createdAt"]) });
      if (t.agentFeeRates.length) await tx.agentFeeRate.createMany({ data: reviveDates(t.agentFeeRates as never[], ["updatedAt"]) });
    },
    { timeout: 120_000 }
  );

  for (const table of [
    "staff",
    "agents",
    "master_categories",
    "fee_schedule_defaults",
    "field_requirements",
    "ack_import_mappings",
    "attendance",
    "pan_applications",
    "tan_applications",
    "dispatch_register",
    "client_queries",
    "day_end_report_recipients",
    "documents",
    "agent_fee_rates",
  ]) {
    await resetSequence(table);
  }
}

/**
 * Human-readable multi-sheet workbook version of the same backup — one sheet per module, for
 * review/reference. Not restorable itself; use the JSON export/restore for that.
 */
export function createBackupWorkbook(payload: BackupPayload): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();

  function sheet<T extends Record<string, unknown>>(name: string, rows: T[], columns: { header: string; key: string; width?: number }[]) {
    const ws = workbook.addWorksheet(name);
    ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
    ws.getRow(1).font = { bold: true };
    for (const row of rows) ws.addRow(row);
  }

  sheet("Staff", payload.tables.staff as Record<string, unknown>[], [
    { header: "ID", key: "id" },
    { header: "Full Name", key: "fullName", width: 24 },
    { header: "Mobile", key: "mobile" },
    { header: "Email", key: "email", width: 28 },
    { header: "Role", key: "role" },
    { header: "Active", key: "isActive" },
    { header: "Last Login", key: "lastLoginAt", width: 22 },
  ]);

  sheet("Agents", payload.tables.agents as Record<string, unknown>[], [
    { header: "ID", key: "id" },
    { header: "Agent Name", key: "agentName", width: 24 },
    { header: "Firm", key: "firmName", width: 20 },
    { header: "Mobile", key: "mobile" },
    { header: "Email", key: "email", width: 28 },
    { header: "Active", key: "isActive" },
    { header: "Last Login", key: "lastLoginAt", width: 22 },
  ]);

  const panRows = (payload.tables.panApplications as Array<Record<string, unknown>>).map((r) => ({
    ...r,
    aadhaarNumber: r.aadhaarEncrypted ? decryptAadhaar(r.aadhaarEncrypted as string) : "",
  }));
  sheet("PAN Applications", panRows, [
    { header: "ID", key: "id" },
    { header: "Applicant", key: "applicantName", width: 24 },
    { header: "Mobile", key: "mobile" },
    { header: "Aadhaar", key: "aadhaarNumber", width: 16 },
    { header: "Type", key: "applicationType" },
    { header: "Status", key: "status" },
    { header: "Fee", key: "feeAmount" },
    { header: "Form Received", key: "formReceivedDate", width: 14 },
  ]);

  sheet("TAN Applications", payload.tables.tanApplications as Record<string, unknown>[], [
    { header: "ID", key: "id" },
    { header: "Applicant", key: "applicantName", width: 24 },
    { header: "Mobile", key: "mobile" },
    { header: "Category", key: "applicantCategory" },
    { header: "Type", key: "applicationType" },
    { header: "Status", key: "status" },
    { header: "Fee", key: "feeAmount" },
    { header: "Form Received", key: "formReceivedDate", width: 14 },
  ]);

  sheet("Dispatch Register", payload.tables.dispatchRegister as Record<string, unknown>[], [
    { header: "ID", key: "id" },
    { header: "Type", key: "entryType" },
    { header: "Party", key: "partyDetails", width: 24 },
    { header: "Mobile", key: "mobile" },
    { header: "Consignment #", key: "consignmentNumber", width: 18 },
  ]);

  sheet("Client Queries", payload.tables.clientQueries as Record<string, unknown>[], [
    { header: "ID", key: "id" },
    { header: "Client", key: "clientName", width: 22 },
    { header: "Mobile", key: "mobile" },
    { header: "Status", key: "status" },
    { header: "Query", key: "queryText", width: 40 },
  ]);

  sheet("Master Categories", payload.tables.masterCategories as Record<string, unknown>[], [
    { header: "ID", key: "id" },
    { header: "Kind", key: "kind" },
    { header: "Name", key: "name", width: 24 },
    { header: "Active", key: "isActive" },
  ]);

  sheet("Fee Schedule Defaults", payload.tables.feeScheduleDefaults as Record<string, unknown>[], [
    { header: "ID", key: "id" },
    { header: "Module", key: "module" },
    { header: "Application Type", key: "applicationType" },
    { header: "Signed Status", key: "signedStatus" },
    { header: "Amount", key: "amount" },
  ]);

  sheet("Agent Fee Rates", payload.tables.agentFeeRates as Record<string, unknown>[], [
    { header: "ID", key: "id" },
    { header: "Agent ID", key: "agentId" },
    { header: "Module", key: "module" },
    { header: "Application Type", key: "applicationType" },
    { header: "Signed Status", key: "signedStatus" },
    { header: "Amount", key: "amount" },
  ]);

  sheet("Field Requirements", payload.tables.fieldRequirements as Record<string, unknown>[], [
    { header: "ID", key: "id" },
    { header: "Module", key: "module" },
    { header: "Field", key: "fieldKey", width: 22 },
    { header: "Required", key: "required" },
  ]);

  return workbook;
}

export interface WipeResult {
  adminEmail: string;
  counts: Record<string, number>;
}

/**
 * Clears transactional/records data down to just the admin login, preserving office
 * configuration (Master Categories, Fee Schedule, Field Requirements, SMTP settings, Ack
 * Import mapping, Document templates) — the same scope used for the earlier one-off migration
 * cutover wipe. Caller is responsible for taking/emailing a backup first.
 */
export async function wipeAllData(): Promise<WipeResult> {
  const admin = await prisma.staff.findFirst({ where: { role: "ADMIN" }, orderBy: { id: "asc" } });
  if (!admin) throw new Error("No ADMIN staff account found — aborting wipe to avoid locking everyone out.");

  const counts = await prisma.$transaction(async (tx) => {
    const result: Record<string, number> = {};

    await tx.document.updateMany({ where: { uploadedById: { not: admin.id } }, data: { uploadedById: null } });
    await tx.ackImportMapping.updateMany({ where: { updatedById: { not: admin.id } }, data: { updatedById: null } });

    result.auditLog = (await tx.auditLog.deleteMany({})).count;
    result.sessions = (await tx.session.deleteMany({})).count;
    result.dayEndReportRecipients = (await tx.dayEndReportRecipient.deleteMany({})).count;
    result.attendance = (await tx.attendance.deleteMany({})).count;
    result.clientQueries = (await tx.clientQuery.deleteMany({})).count;
    result.dispatchRegister = (await tx.dispatchRegister.deleteMany({})).count;

    await tx.panApplication.updateMany({ data: { adjustedFromFormId: null } });
    await tx.tanApplication.updateMany({ data: { adjustedFromFormId: null } });
    result.panApplications = (await tx.panApplication.deleteMany({})).count;
    result.tanApplications = (await tx.tanApplication.deleteMany({})).count;

    result.agentFeeRates = (await tx.agentFeeRate.deleteMany({})).count;
    result.agents = (await tx.agent.deleteMany({})).count;
    result.staff = (await tx.staff.deleteMany({ where: { id: { not: admin.id } } })).count;

    return result;
  });

  return { adminEmail: admin.email, counts };
}
