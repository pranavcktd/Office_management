import { Router } from "express";
import { requireAdmin, requireReadAccess, requireStaff } from "../../middleware/auth";
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
attendanceRouter.get("/monthly", requireReadAccess, monthlyReport);
attendanceRouter.get("/monthly/export", requireReadAccess, exportMonthly);
attendanceRouter.get("/daily", requireReadAccess, listByDate);
attendanceRouter.get("/daily/export", requireReadAccess, exportDaily);
attendanceRouter.post("/mark", requireAdmin, adminMark);
attendanceRouter.patch("/:id/override", requireAdmin, adminOverride);
