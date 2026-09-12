import { Router } from "express";
import { requireAdmin } from "../../middleware/auth";
import { listAudit } from "./audit.controller";

export const auditRouter = Router();

auditRouter.get("/", requireAdmin, listAudit);
