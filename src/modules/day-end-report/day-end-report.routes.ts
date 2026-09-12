import { Router } from "express";
import { requireAdmin } from "../../middleware/auth";
import { previewReport, sendNow } from "./day-end-report.controller";

export const dayEndReportRouter = Router();

dayEndReportRouter.get("/preview", requireAdmin, previewReport);
dayEndReportRouter.post("/send", requireAdmin, sendNow);
