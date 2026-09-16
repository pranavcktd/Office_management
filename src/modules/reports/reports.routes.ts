import { Router } from "express";
import { requireAdmin, requireReadAccess } from "../../middleware/auth";
import {
  acknowledgeDiscrepancy,
  exportAdjustedReport,
  exportCreditStatusReport,
  exportDiscrepancies,
  exportRejectedReport,
  getDailyActivity,
  listAdjustedReport,
  listCreditStatusReport,
  listDiscrepancies,
  listRejectedReport,
} from "./reports.controller";

export const reportsRouter = Router();

reportsRouter.get("/daily-activity", requireReadAccess, getDailyActivity);
reportsRouter.get("/rejected", requireReadAccess, listRejectedReport);
reportsRouter.get("/rejected/export", requireReadAccess, exportRejectedReport);
reportsRouter.get("/adjusted", requireReadAccess, listAdjustedReport);
reportsRouter.get("/adjusted/export", requireReadAccess, exportAdjustedReport);
reportsRouter.get("/credit-status", requireReadAccess, listCreditStatusReport);
reportsRouter.get("/credit-status/export", requireReadAccess, exportCreditStatusReport);
reportsRouter.get("/discrepancies", requireReadAccess, listDiscrepancies);
reportsRouter.get("/discrepancies/export", requireReadAccess, exportDiscrepancies);
// Marking a discrepancy reviewed is a management decision, not a read — stays admin-only even
// though everything else in this router is open to an auditor.
reportsRouter.patch("/discrepancies/:id/acknowledge", requireAdmin, acknowledgeDiscrepancy);
