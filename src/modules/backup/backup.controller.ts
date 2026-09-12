import { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { logAudit } from "../../utils/audit";
import { sendMail } from "../../utils/mailer";
import {
  BackupPayload,
  createFullBackup,
  createBackupWorkbook,
  restoreFullBackup,
  wipeAllData,
} from "../../utils/backupService";

export const exportBackupJson = asyncHandler(async (_req: Request, res: Response) => {
  const payload = await createFullBackup();
  const filename = `office-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(JSON.stringify(payload, null, 2));
});

export const exportBackupXlsx = asyncHandler(async (_req: Request, res: Response) => {
  const payload = await createFullBackup();
  const workbook = createBackupWorkbook(payload);
  const filename = `office-backup-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
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
  await logAudit(req, { action: "BACKUP_RESTORED", entityType: "system", entityId: 0, meta: { exportedAt: payload.exportedAt } });
  res.json({ ok: true });
});

const wipeConfirmSchema = z.object({ confirm: z.literal("WIPE") });

export const wipeAndBackup = asyncHandler(async (req: Request, res: Response) => {
  const { confirm } = wipeConfirmSchema.parse(req.body);
  if (confirm !== "WIPE") throw new ApiError(400, 'Type "WIPE" to confirm this destructive action');

  const payload = await createFullBackup();
  const backupFilename = `office-backup-before-wipe-${new Date().toISOString().slice(0, 10)}.json`;

  const result = await wipeAllData();

  await sendMail({
    to: result.adminEmail,
    subject: "Backup before full data wipe — Office Management Portal",
    text: `A full data wipe was just performed. Attached is a complete backup of everything as it stood immediately beforehand — keep it safe if you ever need to restore.\n\nRecords removed:\n${Object.entries(result.counts)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n")}`,
    attachments: [{ filename: backupFilename, content: Buffer.from(JSON.stringify(payload, null, 2), "utf8"), contentType: "application/json" }],
  });

  await logAudit(req, { action: "DATA_WIPED", entityType: "system", entityId: 0, meta: result.counts });
  res.json({ ok: true, ...result });
});
