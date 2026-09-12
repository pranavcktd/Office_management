import { Router } from "express";
import { requireStaff } from "../../middleware/auth";
import { getDashboard } from "./dashboard.controller";

export const dashboardRouter = Router();

dashboardRouter.get("/", requireStaff, getDashboard);
