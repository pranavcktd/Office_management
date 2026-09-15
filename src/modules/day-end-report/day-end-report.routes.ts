import { Router } from "express";
import { requireAdmin, requireReadAccess } from "../../middleware/auth";
import { downloadRangeReport, previewReport, sendNow } from "./day-end-report.controller";

export const dayEndReportRouter = Router();

dayEndReportRouter.get("/preview", requireReadAccess, previewReport);
dayEndReportRouter.post("/send", requireAdmin, sendNow);
dayEndReportRouter.get("/range", requireReadAccess, downloadRangeReport);
