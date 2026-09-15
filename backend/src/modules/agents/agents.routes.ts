import { Router } from "express";
import { requireAdmin, requireReadAccess, requireRole, requireStaff } from "../../middleware/auth";
import { uploadExcel } from "../../middleware/upload";
import {
  bulkEmailAgents,
  bulkNotifyAgents,
  bulkResetAgentPasswords,
  bulkSetAgentFeeRates,
  createAgent,
  deleteAgent,
  downloadAgentImportTemplate,
  getAgent,
  getAgentLedger,
  getFeeMatrix,
  importAgentsBulk,
  listAgents,
  recomputeStandardFee,
  remapAgentEmails,
  resetAgentPassword,
  setAgentEmails,
  setAgentFeeRates,
  updateAgent,
} from "./agents.controller";
import {
  getApplicationDetail as getAgentPortalApplicationDetail,
  getSummary as getAgentPortalSummary,
  listApplications as listAgentPortalApplications,
  listMyQueries as listAgentPortalQueries,
  listNotifications as listAgentPortalNotifications,
} from "../agent-portal/agent-portal.controller";

export const agentsRouter = Router();

// Read-only "view as agent" for admin/auditor support (not plain STAFF — this is a support
// tool, not a module data view) — reuses the agent portal's own handlers (see
// agent-portal.controller.ts's agentId() resolver), scoped by :agentId instead of the caller's
// own session. No write routes are mirrored here: never act on the agent's behalf.
const requireAdminOrAuditor = requireRole("ADMIN", "AUDITOR");
agentsRouter.get("/:agentId/portal/summary", requireAdminOrAuditor, getAgentPortalSummary);
agentsRouter.get("/:agentId/portal/applications", requireAdminOrAuditor, listAgentPortalApplications);
agentsRouter.get("/:agentId/portal/applications/:module/:id", requireAdminOrAuditor, getAgentPortalApplicationDetail);
agentsRouter.get("/:agentId/portal/queries", requireAdminOrAuditor, listAgentPortalQueries);
agentsRouter.get("/:agentId/portal/notifications", requireAdminOrAuditor, listAgentPortalNotifications);

agentsRouter.get("/", requireReadAccess, listAgents);
agentsRouter.get("/fee-matrix", requireReadAccess, getFeeMatrix);
agentsRouter.put("/fee-rates/bulk", requireAdmin, bulkSetAgentFeeRates);
agentsRouter.post("/fee-rates/recompute", requireAdmin, recomputeStandardFee);
agentsRouter.get("/import-template", requireAdmin, downloadAgentImportTemplate);
agentsRouter.post("/import", requireAdmin, uploadExcel.single("file"), importAgentsBulk);

// Bulk actions on a multi-selected set of agents (see AgentListPage's selection toolbar). Must
// come before the /:id/* routes below — Express matches by registration order, not specificity,
// so "/bulk/reset-password" would otherwise be swallowed by "/:id/reset-password" (id="bulk").
agentsRouter.post("/bulk/email", requireAdmin, bulkEmailAgents);
agentsRouter.post("/bulk/notify", requireAdmin, bulkNotifyAgents);
agentsRouter.post("/bulk/reset-password", requireAdmin, bulkResetAgentPasswords);

agentsRouter.get("/:id", requireReadAccess, getAgent);
agentsRouter.get("/:id/ledger", requireReadAccess, getAgentLedger);
agentsRouter.post("/", requireAdmin, createAgent);
agentsRouter.patch("/:id", requireAdmin, updateAgent);
agentsRouter.put("/:id/fee-rates", requireAdmin, setAgentFeeRates);
agentsRouter.put("/:id/emails", requireAdmin, setAgentEmails);
agentsRouter.post("/:id/emails/remap", requireAdmin, remapAgentEmails);
agentsRouter.post("/:id/reset-password", requireAdmin, resetAgentPassword);
agentsRouter.delete("/:id", requireAdmin, deleteAgent);
