import { Router } from "express";
import { requireAdmin, requireStaff } from "../../middleware/auth";
import { uploadExcel } from "../../middleware/upload";
import {
  createTan,
  deleteTan,
  downloadTanImportTemplate,
  exportTan,
  getAdjustmentCandidates,
  getStandardFee,
  getTan,
  importTanAckReport,
  importTanBulk,
  listTan,
  updateTan,
  updateTanStatus,
} from "./tan.controller";

export const tanRouter = Router();

tanRouter.get("/", requireStaff, listTan);
tanRouter.get("/export", requireStaff, exportTan);
tanRouter.get("/adjustment-candidates", requireStaff, getAdjustmentCandidates);
tanRouter.get("/standard-fee", requireStaff, getStandardFee);
tanRouter.get("/import-template", requireAdmin, downloadTanImportTemplate);
tanRouter.get("/:id", requireStaff, getTan);
tanRouter.post("/", requireStaff, createTan);
tanRouter.post("/import-ack", requireStaff, uploadExcel.single("file"), importTanAckReport);
tanRouter.post("/import", requireAdmin, uploadExcel.single("file"), importTanBulk);
tanRouter.patch("/:id", requireAdmin, updateTan);
tanRouter.patch("/:id/status", requireStaff, updateTanStatus);
tanRouter.delete("/:id", requireAdmin, deleteTan);
