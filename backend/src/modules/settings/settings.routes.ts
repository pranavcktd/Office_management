import { Router } from "express";
import { requireAdmin, requireStaff } from "../../middleware/auth";
import {
  getDayEndRecipients,
  getEmailConfig,
  getFeeSchedule,
  getFieldRequirementsConfig,
  getProteanReportMapping,
  getSiteContent,
  sendTestEmail,
  setDayEndRecipients,
  updateEmailConfig,
  updateFeeSchedule,
  updateFieldRequirementsConfig,
  updateSiteContent,
  upsertProteanReportMapping,
} from "./settings.controller";

export const settingsRouter = Router();

settingsRouter.get("/protean-mapping/:module", requireStaff, getProteanReportMapping);
settingsRouter.put("/protean-mapping/:module", requireAdmin, upsertProteanReportMapping);

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
