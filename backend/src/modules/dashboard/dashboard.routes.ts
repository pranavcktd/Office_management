import { Router } from "express";
import { requireReadAccess } from "../../middleware/auth";
import { getDashboard } from "./dashboard.controller";

export const dashboardRouter = Router();

dashboardRouter.get("/", requireReadAccess, getDashboard);
