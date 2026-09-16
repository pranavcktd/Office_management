import { Router } from "express";
import { requireAdmin, requireReadAccess, requireRole, requireStaff } from "../../middleware/auth";
import {
  createStaff,
  deactivateStaff,
  getStaff,
  getStaffProfile,
  listStaff,
  resetStaffPassword,
  updateStaff,
} from "./staff.controller";

export const staffRouter = Router();

// Read-only "view this user's login" support tool — ADMIN and AUDITOR only, same narrower gate
// as the equivalent "view as agent" routes (a support/oversight tool, not a general staff-facing
// view — a plain STAFF sees only their own data via the normal attendance/ledger endpoints).
const requireAdminOrAuditor = requireRole("ADMIN", "AUDITOR");
staffRouter.get("/:id/profile", requireAdminOrAuditor, getStaffProfile);

staffRouter.get("/", requireReadAccess, listStaff);
staffRouter.get("/:id", requireReadAccess, getStaff);
staffRouter.post("/", requireAdmin, createStaff);
staffRouter.patch("/:id", requireAdmin, updateStaff);
staffRouter.post("/:id/reset-password", requireAdmin, resetStaffPassword);
staffRouter.delete("/:id", requireAdmin, deactivateStaff);
