import { Router } from "express";
import { requireAdmin, requireStaff } from "../../middleware/auth";
import { uploadExcel } from "../../middleware/upload";
import {
  createPan,
  deletePan,
  downloadPanAckPunchingTemplate,
  downloadPanImportTemplate,
  exportPan,
  getAdjustmentCandidates,
  getPan,
  getStandardFee,
  importAckReport,
  importPanAckPunching,
  importPanBulk,
  listPan,
  updatePan,
  updatePanAck,
  updatePanStatus,
} from "./pan.controller";

export const panRouter = Router();

panRouter.get("/", requireStaff, listPan);
panRouter.get("/export", requireStaff, exportPan);
panRouter.get("/adjustment-candidates", requireStaff, getAdjustmentCandidates);
panRouter.get("/standard-fee", requireStaff, getStandardFee);
panRouter.get("/import-template", requireAdmin, downloadPanImportTemplate);
panRouter.get("/import-ack-punching-template", requireAdmin, downloadPanAckPunchingTemplate);
panRouter.get("/:id", requireStaff, getPan);
panRouter.post("/", requireStaff, createPan);
panRouter.post("/import-ack", requireStaff, uploadExcel.single("file"), importAckReport);
panRouter.post("/import-ack-punching", requireAdmin, uploadExcel.single("file"), importPanAckPunching);
panRouter.post("/import", requireAdmin, uploadExcel.single("file"), importPanBulk);
panRouter.patch("/:id", requireAdmin, updatePan);
panRouter.patch("/:id/status", requireStaff, updatePanStatus);
panRouter.patch("/:id/ack", requireStaff, updatePanAck);
panRouter.delete("/:id", requireAdmin, deletePan);
