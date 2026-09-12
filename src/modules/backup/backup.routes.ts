import { Router } from "express";
import { uploadBackup } from "../../middleware/uploadBackup";
import { exportBackupJson, exportBackupXlsx, restoreBackup, wipeAndBackup } from "./backup.controller";

export const backupRouter = Router();

backupRouter.get("/export.json", exportBackupJson);
backupRouter.get("/export.xlsx", exportBackupXlsx);
backupRouter.post("/restore", uploadBackup.single("file"), restoreBackup);
backupRouter.post("/wipe", wipeAndBackup);
