import { Router } from "express";
import {
  exportAdjustedReport,
  exportCreditStatusReport,
  exportRejectedReport,
  listAdjustedReport,
  listCreditStatusReport,
  listRejectedReport,
} from "./reports.controller";

export const reportsRouter = Router();

reportsRouter.get("/rejected", listRejectedReport);
reportsRouter.get("/rejected/export", exportRejectedReport);
reportsRouter.get("/adjusted", listAdjustedReport);
reportsRouter.get("/adjusted/export", exportAdjustedReport);
reportsRouter.get("/credit-status", listCreditStatusReport);
reportsRouter.get("/credit-status/export", exportCreditStatusReport);
