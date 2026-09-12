import { Router } from "express";
import { requireAdmin, requireStaff } from "../../middleware/auth";
import {
  getAckMapping,
  getDayEndRecipients,
  getEmailConfig,
  getFeeSchedule,
  getFieldRequirementsConfig,
  getSiteContent,
  sendTestEmail,
  setDayEndRecipients,
  updateEmailConfig,
  updateFeeSchedule,
  updateFieldRequirementsConfig,
  updateSiteContent,
  upsertAckMapping,
} from "./settings.controller";

export const settingsRouter = Router();

settingsRouter.get("/ack-mapping/:module", requireStaff, getAckMapping);
settingsRouter.put("/ack-mapping/:module", requireAdmin, upsertAckMapping);

settingsRouter.get("/email", requireAdmin, getEmailConfig);
settingsRouter.put("/email", requireAdmin, updateEmailConfig);
settingsRouter.post("/email/test", requireAdmin, sendTestEmail);

settingsRouter.get("/day-end-recipients", requireAdmin, getDayEndRecipients);
settingsRouter.put("/day-end-recipients", requireAdmin, setDayEndRecipients);

settingsRouter.get("/field-requirements/:module", requireStaff, getFieldRequirementsConfig);
settingsRouter.put("/field-requirements/:module", requireAdmin, updateFieldRequirementsConfig);

settingsRouter.get("/fee-schedule/:module", requireStaff, getFeeSchedule);
settingsRouter.put("/fee-schedule/:module", requireAdmin, updateFeeSchedule);

settingsRouter.get("/site-content", requireAdmin, getSiteContent);
settingsRouter.put("/site-content", requireAdmin, updateSiteContent);
