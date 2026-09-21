import { Router } from "express";
import { uploadBackup } from "../../middleware/uploadBackup";
import {
  exportBackupJson,
  exportBackupSql,
  exportBackupXlsx,
  exportBackupZip,
  mergeRestore,
  restoreBackup,
  wipeAndBackup,
} from "./backup.controller";

export const backupRouter = Router();

backupRouter.get("/export.json", exportBackupJson);
backupRouter.get("/export.xlsx", exportBackupXlsx);
backupRouter.get("/export.sql", exportBackupSql);
backupRouter.get("/export.zip", exportBackupZip);
backupRouter.post("/restore", uploadBackup.single("file"), restoreBackup);
backupRouter.post("/merge-restore", uploadBackup.single("file"), mergeRestore);
backupRouter.post("/wipe", wipeAndBackup);
