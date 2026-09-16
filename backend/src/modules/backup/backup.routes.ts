import { Router } from "express";
import { uploadBackup } from "../../middleware/uploadBackup";
import {
  exportBackupJson,
  exportBackupSql,
  exportBackupXlsx,
  exportBackupZip,
  restoreBackup,
  wipeAndBackup,
} from "./backup.controller";

export const backupRouter = Router();

backupRouter.get("/export.json", exportBackupJson);
backupRouter.get("/export.xlsx", exportBackupXlsx);
backupRouter.get("/export.sql", exportBackupSql);
backupRouter.get("/export.zip", exportBackupZip);
backupRouter.post("/restore", uploadBackup.single("file"), restoreBackup);
backupRouter.post("/wipe", wipeAndBackup);
