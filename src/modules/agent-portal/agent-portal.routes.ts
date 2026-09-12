import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth";
import { createAgentDraftPan, updateAgentDraftPan } from "../pan/pan.controller";
import { createAgentDraftTan, updateAgentDraftTan } from "../tan/tan.controller";
import {
  createMyQuery,
  getApplicationDetail,
  getSummary,
  listApplications,
  listMyQueries,
  listServiceCategories,
} from "./agent-portal.controller";

export const agentPortalRouter = Router();

agentPortalRouter.use(authenticate, requireRole("AGENT"));

agentPortalRouter.get("/summary", getSummary);
agentPortalRouter.get("/applications", listApplications);
agentPortalRouter.post("/applications/pan", createAgentDraftPan);
agentPortalRouter.patch("/applications/pan/:id", updateAgentDraftPan);
agentPortalRouter.post("/applications/tan", createAgentDraftTan);
agentPortalRouter.patch("/applications/tan/:id", updateAgentDraftTan);
agentPortalRouter.get("/applications/:module/:id", getApplicationDetail);
agentPortalRouter.get("/service-categories", listServiceCategories);
agentPortalRouter.get("/queries", listMyQueries);
agentPortalRouter.post("/queries", createMyQuery);
