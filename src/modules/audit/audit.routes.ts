import { Router } from "express";
import { requireReadAccess } from "../../middleware/auth";
import { listAudit } from "./audit.controller";

export const auditRouter = Router();

// The audit trail is exactly what an auditor role exists to review.
auditRouter.get("/", requireReadAccess, listAudit);
