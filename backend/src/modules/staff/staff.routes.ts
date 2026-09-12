import { Router } from "express";
import { requireAdmin, requireStaff } from "../../middleware/auth";
import {
  createStaff,
  deactivateStaff,
  getStaff,
  listStaff,
  resetStaffPassword,
  updateStaff,
} from "./staff.controller";

export const staffRouter = Router();

staffRouter.get("/", requireStaff, listStaff);
staffRouter.get("/:id", requireStaff, getStaff);
staffRouter.post("/", requireAdmin, createStaff);
staffRouter.patch("/:id", requireAdmin, updateStaff);
staffRouter.post("/:id/reset-password", requireAdmin, resetStaffPassword);
staffRouter.delete("/:id", requireAdmin, deactivateStaff);
