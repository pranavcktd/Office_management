import { Router } from "express";
import { requireAdmin, requireReadAccess, requireStaff } from "../../middleware/auth";
import { uploadExcel } from "../../middleware/upload";
import {
  createTan,
  deleteTan,
  downloadTanProteanTemplate,
  exportTan,
  getAdjustmentCandidates,
  getStandardFee,
  getTan,
  importTanProteanPunching,
  listTan,
  previewTanProteanPunching,
  updateTan,
  updateTanAck,
  updateTanStatus,
} from "./tan.controller";

export const tanRouter = Router();

tanRouter.get("/", requireReadAccess, listTan);
tanRouter.get("/export", requireReadAccess, exportTan);
tanRouter.get("/adjustment-candidates", requireStaff, getAdjustmentCandidates);
tanRouter.get("/standard-fee", requireStaff, getStandardFee);
tanRouter.get("/import-protean-punching-template", requireAdmin, downloadTanProteanTemplate);
tanRouter.get("/:id", requireReadAccess, getTan);
tanRouter.post("/", requireStaff, createTan);
tanRouter.post("/import-protean-punching", requireAdmin, uploadExcel.single("file"), importTanProteanPunching);
tanRouter.post("/import-protean-punching/preview", requireAdmin, uploadExcel.single("file"), previewTanProteanPunching);
tanRouter.patch("/:id", requireAdmin, updateTan);
tanRouter.patch("/:id/status", requireStaff, updateTanStatus);
tanRouter.patch("/:id/ack", requireStaff, updateTanAck);
tanRouter.delete("/:id", requireAdmin, deleteTan);
