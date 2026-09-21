import { Request, Response } from "express";
import JSZip from "jszip";
import { z } from "zod";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { logAudit } from "../../utils/audit";
import { sendMail } from "../../utils/mailer";
import {
  BackupPayload,
  createFullBackup,
  createBackupWorkbook,
  mergeRestoreBackup,
  restoreFullBackup,
  wipeAllData,
} from "../../utils/backupService";
import { buildBackupSql } from "../../utils/backupSql";
import { prisma } from "../../db/prisma";
import bcrypt from "bcryptjs";
import { DEFAULT_PASSWORD } from "../../utils/password";
import { env } from "../../config/env";

// Date + time (not just date) so two backups taken the same day never share a filename —
// e.g. "2026-09-21_14-35-06". Colons are stripped since Windows filenames can't contain them.
function backupTimestamp(): string {
  return new Date().toISOString().replace(/:/g, "-").replace("T", "_").slice(0, 19);
}

/** Whoever's actually signed in and doing this — every Backup & Restore action is admin-only
 * (see app.ts's mount), so this is always a staff admin, never an agent. */
async function actorName(req: Request): Promise<string> {
  if (req.user?.kind !== "staff") return "system";
  const staff = await prisma.staff.findUnique({ where: { id: req.user.id }, select: { fullName: true } });
  return staff?.fullName ?? `staff #${req.user.id}`;
}

async function getAllAdmins() {
  return prisma.staff.findMany({ where: { role: "ADMIN" }, select: { id: true, fullName: true, email: true } });
}

/** Every Backup & Restore action alerts every current admin, not just whoever's doing it — this
 * is the one area of the app that can touch every login or all data at once, so everyone with
 * the keys should know it happened even if they weren't the one at the keyboard. */
async function alertAdmins(subject: string, bodyLines: string[]) {
  const admins = await getAllAdmins();
  await Promise.all(
    admins
      .filter((a) => a.email)
      .map((a) => sendMail({ to: a.email as string, subject, text: bodyLines.join("\n") }))
  );
  return admins;
}

/** Fire-and-forget alert + audit trail shared by all four plain export formats below — none of
 * these change any data, so the alert is just an FYI record that a copy of everything left the
 * system, not a security-critical notice the way restore's is. */
async function alertExport(req: Request, format: string) {
  try {
    const who = await actorName(req);
    await logAudit(req, { action: "BACKUP_EXPORTED", entityType: "system", entityId: 0, meta: { format } });
    await alertAdmins(`ALERT: backup exported (${format.toUpperCase()}) — Office Management Portal`, [
      `A ${format.toUpperCase()} backup was exported by ${who} at ${new Date().toLocaleString()}.`,
      "No data was changed — this is an FYI record only.",
    ]);
  } catch (err) {
    console.error("[backup] export alert failed (response already sent, safe to ignore):", err);
  }
}

export const exportBackupJson = asyncHandler(async (req: Request, res: Response) => {
  const payload = await createFullBackup();
  const filename = `office-backup-${backupTimestamp()}.json`;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(JSON.stringify(payload, null, 2));
  void alertExport(req, "json");
});

export const exportBackupXlsx = asyncHandler(async (req: Request, res: Response) => {
  const payload = await createFullBackup();
  const workbook = createBackupWorkbook(payload);
  const filename = `office-backup-${backupTimestamp()}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
  void alertExport(req, "xlsx");
});

export const exportBackupSql = asyncHandler(async (req: Request, res: Response) => {
  const payload = await createFullBackup();
  const sql = buildBackupSql(payload);
  const filename = `office-backup-${backupTimestamp()}.sql`;
  res.setHeader("Content-Type", "application/sql");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(sql);
  void alertExport(req, "sql");
});

// Everything in one download — Excel (for a quick human look), JSON (this app's own restore
// format), and SQL (for restoring outside this app — e.g. `psql` against a fresh Railway
// Postgres instance whose schema already matches, or handing to a DBA). One backup run covers
// all three so they can never disagree with each other.
export const exportBackupZip = asyncHandler(async (req: Request, res: Response) => {
  const payload = await createFullBackup();
  const stamp = backupTimestamp();

  const zip = new JSZip();
  zip.file(`office-backup-${stamp}.json`, JSON.stringify(payload, null, 2));
  zip.file(`office-backup-${stamp}.sql`, buildBackupSql(payload));
  const workbook = createBackupWorkbook(payload);
  const xlsxBuffer = await workbook.xlsx.writeBuffer();
  zip.file(`office-backup-${stamp}.xlsx`, xlsxBuffer);

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="office-backup-${stamp}.zip"`);
  res.send(zipBuffer);
  void alertExport(req, "zip");
});

const restoreConfirmSchema = z.object({ confirm: z.literal("RESTORE") });

export const restoreBackup = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(400, "No backup file uploaded (field name: 'file')");
  const { confirm } = restoreConfirmSchema.parse(req.body);
  if (confirm !== "RESTORE") throw new ApiError(400, 'Type "RESTORE" to confirm this destructive action');

  let payload: BackupPayload;
  try {
    payload = JSON.parse(req.file.buffer.toString("utf8"));
  } catch {
    throw new ApiError(400, "That file isn't valid JSON");
  }
  if (!payload || typeof payload !== "object" || !payload.tables) {
    throw new ApiError(400, "That file doesn't look like an office backup export");
  }

  await restoreFullBackup(payload);

  // This wipes and reinserts every staff row from the file, so whoever's password hash the
  // backup happened to carry is what's now live — normally fine (it round-trips exactly), but
  // this is the one operation in the app that touches every login at once, so it gets its own
  // guaranteed fallback: every restored ADMIN account is force-reset to the same default
  // password new accounts start on, with a forced change on next login. Never leaves you locked
  // out no matter what the backup's own password hashes turn out to be.
  const resetPasswordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const admins = await prisma.staff.findMany({ where: { role: "ADMIN" }, select: { id: true, fullName: true, email: true } });
  if (admins.length > 0) {
    await prisma.staff.updateMany({
      where: { id: { in: admins.map((a) => a.id) } },
      data: { passwordHash: resetPasswordHash, mustChangePassword: true, pendingPasswordHash: null, pendingPasswordExpiresAt: null },
    });
  }

  // Each admin gets their own login id spelled out, not a broadcast — same reasoning as the
  // agent password-reset alert (see agents.controller.ts's sendAgentPasswordResetEmail).
  await Promise.all(
    admins
      .filter((a) => a.email)
      .map((a) =>
        sendMail({
          to: a.email as string,
          subject: "ALERT: backup restored — your login was reset",
          text: [
            `Hello ${a.fullName},`,
            "",
            "A full backup restore was just performed on the Office Management Portal. Because this",
            "operation replaces all data, every admin login (including yours) was reset as a safety",
            "measure, regardless of what the restored backup's own saved password was.",
            "",
            `Login URL: ${env.frontendUrl}/login`,
            `User ID: ${a.email}`,
            `Temporary Password: ${DEFAULT_PASSWORD}`,
            "",
            "You'll be asked to choose a new password the moment you sign in.",
            `Backup restored was exported at: ${payload.exportedAt}`,
          ].join("\n"),
        })
      )
  );

  await logAudit(req, { action: "BACKUP_RESTORED", entityType: "system", entityId: 0, meta: { exportedAt: payload.exportedAt, adminsReset: admins.map((a) => a.email) } });
  res.json({ ok: true, adminEmails: admins.map((a) => a.email), defaultPassword: DEFAULT_PASSWORD });
});

const mergeRestoreConfirmSchema = z.object({ confirm: z.literal("MERGE") });

// The non-destructive counterpart to restoreBackup above — inserts whatever the file has that
// isn't already here, never wipes or touches existing rows, so no login is ever disturbed and
// this needs no admin-password fallback of its own.
export const mergeRestore = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(400, "No backup file uploaded (field name: 'file')");
  const { confirm } = mergeRestoreConfirmSchema.parse(req.body);
  if (confirm !== "MERGE") throw new ApiError(400, 'Type "MERGE" to confirm');

  let payload: BackupPayload;
  try {
    payload = JSON.parse(req.file.buffer.toString("utf8"));
  } catch {
    throw new ApiError(400, "That file isn't valid JSON");
  }
  if (!payload || typeof payload !== "object" || !payload.tables) {
    throw new ApiError(400, "That file doesn't look like an office backup export");
  }

  const result = await mergeRestoreBackup(payload);
  const totalInserted = result.tables.reduce((sum, t) => sum + t.inserted, 0);
  await logAudit(req, { action: "BACKUP_MERGED", entityType: "system", entityId: 0, meta: { exportedAt: payload.exportedAt, totalInserted, tables: result.tables } });

  const who = await actorName(req);
  await alertAdmins("ALERT: backup merged — Office Management Portal", [
    `A merge restore was performed by ${who} at ${new Date().toLocaleString()}, adding ${totalInserted} record(s) that weren't already here.`,
    "Nothing already in the system was touched, overwritten, or removed — no login was affected.",
    `Backup file was exported at: ${payload.exportedAt}`,
  ]);

  res.json({ ok: true, ...result, totalInserted });
});

const wipeConfirmSchema = z.object({ confirm: z.literal("WIPE") });

export const wipeAndBackup = asyncHandler(async (req: Request, res: Response) => {
  const { confirm } = wipeConfirmSchema.parse(req.body);
  if (confirm !== "WIPE") throw new ApiError(400, 'Type "WIPE" to confirm this destructive action');

  const payload = await createFullBackup();
  const backupFilename = `office-backup-before-wipe-${backupTimestamp()}.json`;

  const result = await wipeAllData();

  await sendMail({
    to: result.adminEmail,
    subject: "ALERT: full data wipe performed — Office Management Portal",
    text: `A full data wipe was just performed. Your own admin login was left untouched. Attached is a complete backup of everything as it stood immediately beforehand — keep it safe if you ever need to restore.\n\nRecords removed:\n${Object.entries(result.counts)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n")}`,
    attachments: [{ filename: backupFilename, content: Buffer.from(JSON.stringify(payload, null, 2), "utf8"), contentType: "application/json" }],
  });

  await logAudit(req, { action: "DATA_WIPED", entityType: "system", entityId: 0, meta: result.counts });
  res.json({ ok: true, ...result });
});
