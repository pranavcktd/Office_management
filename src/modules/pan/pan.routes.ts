import { Router } from "express";
import { requireAdmin, requireReadAccess, requireStaff } from "../../middleware/auth";
import { uploadExcel } from "../../middleware/upload";
import {
  createPan,
  createPanFromConflictRow,
  deletePan,
  downloadPanAckPunchingTemplate,
  downloadPanProteanTemplate,
  exportPan,
  getAdjustmentCandidates,
  getPan,
  getStandardFee,
  importPanAckPunching,
  importPanProteanPunching,
  listPan,
  previewPanAckPunching,
  previewPanProteanPunching,
  updatePan,
  updatePanAck,
  updatePanStatus,
} from "./pan.controller";

export const panRouter = Router();

panRouter.get("/", requireReadAccess, listPan);
panRouter.get("/export", requireReadAccess, exportPan);
panRouter.get("/adjustment-candidates", requireStaff, getAdjustmentCandidates);
panRouter.get("/standard-fee", requireStaff, getStandardFee);
panRouter.get("/import-ack-punching-template", requireAdmin, downloadPanAckPunchingTemplate);
panRouter.get("/import-protean-punching-template", requireAdmin, downloadPanProteanTemplate);
panRouter.get("/:id", requireReadAccess, getPan);
panRouter.post("/", requireStaff, createPan);
panRouter.post("/import-ack-punching", requireAdmin, uploadExcel.single("file"), importPanAckPunching);
panRouter.post("/import-ack-punching/preview", requireAdmin, uploadExcel.single("file"), previewPanAckPunching);
panRouter.post("/import-ack-punching/create-from-conflict", requireAdmin, createPanFromConflictRow);
panRouter.post("/import-protean-punching", requireAdmin, uploadExcel.single("file"), importPanProteanPunching);
panRouter.post("/import-protean-punching/preview", requireAdmin, uploadExcel.single("file"), previewPanProteanPunching);
panRouter.patch("/:id", requireAdmin, updatePan);
panRouter.patch("/:id/status", requireStaff, updatePanStatus);
panRouter.patch("/:id/ack", requireStaff, updatePanAck);
panRouter.delete("/:id", requireAdmin, deletePan);
