import { Router } from "express";
import { requireAdmin, requireStaff } from "../../middleware/auth";
import {
  adminMark,
  adminOverride,
  exportDaily,
  exportMonthly,
  listByDate,
  markFullDay,
  monthlyReport,
  punch,
} from "./attendance.controller";

export const attendanceRouter = Router();

attendanceRouter.post("/punch", requireStaff, punch);
attendanceRouter.post("/mark-full-day", requireStaff, markFullDay);
attendanceRouter.get("/monthly", requireStaff, monthlyReport);
attendanceRouter.get("/monthly/export", requireStaff, exportMonthly);
attendanceRouter.get("/daily", requireStaff, listByDate);
attendanceRouter.get("/daily/export", requireStaff, exportDaily);
attendanceRouter.post("/mark", requireAdmin, adminMark);
attendanceRouter.patch("/:id/override", requireAdmin, adminOverride);
