import { Router } from "express";
import { requireAdmin, requireReadAccess } from "../../middleware/auth";
import { createEntry, deleteEntry, getSummary, listEntries, updateEntry } from "./staff-ledger.controller";

export const staffLedgerRouter = Router();

// Read access is intentionally broader than requireAdmin here (ADMIN/AUDITOR see everyone,
// a plain STAFF sees only their own — enforced inside the controller) so a staff member can
// always view their own credit/debit history; only an admin can add/edit/delete entries.
staffLedgerRouter.get("/summary", requireReadAccess, getSummary);
staffLedgerRouter.get("/", requireReadAccess, listEntries);
staffLedgerRouter.post("/", requireAdmin, createEntry);
staffLedgerRouter.patch("/:id", requireAdmin, updateEntry);
staffLedgerRouter.delete("/:id", requireAdmin, deleteEntry);
