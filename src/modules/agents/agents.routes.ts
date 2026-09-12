import { Router } from "express";
import { requireAdmin, requireStaff } from "../../middleware/auth";
import { uploadExcel } from "../../middleware/upload";
import {
  bulkSetAgentFeeRates,
  createAgent,
  deleteAgent,
  downloadAgentImportTemplate,
  getAgent,
  getAgentLedger,
  getFeeMatrix,
  importAgentsBulk,
  listAgents,
  recomputeStandardFee,
  resetAgentPassword,
  setAgentFeeRates,
  updateAgent,
} from "./agents.controller";

export const agentsRouter = Router();

agentsRouter.get("/", requireStaff, listAgents);
agentsRouter.get("/fee-matrix", requireAdmin, getFeeMatrix);
agentsRouter.put("/fee-rates/bulk", requireAdmin, bulkSetAgentFeeRates);
agentsRouter.post("/fee-rates/recompute", requireAdmin, recomputeStandardFee);
agentsRouter.get("/import-template", requireAdmin, downloadAgentImportTemplate);
agentsRouter.post("/import", requireAdmin, uploadExcel.single("file"), importAgentsBulk);
agentsRouter.get("/:id", requireStaff, getAgent);
agentsRouter.get("/:id/ledger", requireStaff, getAgentLedger);
agentsRouter.post("/", requireAdmin, createAgent);
agentsRouter.patch("/:id", requireAdmin, updateAgent);
agentsRouter.put("/:id/fee-rates", requireAdmin, setAgentFeeRates);
agentsRouter.post("/:id/reset-password", requireAdmin, resetAgentPassword);
agentsRouter.delete("/:id", requireAdmin, deleteAgent);
