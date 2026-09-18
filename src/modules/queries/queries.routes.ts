import { Router } from "express";
import { authenticate, requireAdmin, requireModule, requireReadAccess, requireStaff } from "../../middleware/auth";
import {
  addQueryUpdate,
  assignQuery,
  createQuery,
  deleteQuery,
  editQuery,
  exportQueries,
  getQuery,
  listQueries,
  updateQuery,
} from "./queries.controller";

export const queriesRouter = Router();

// Public intake: online web inquiries and staff-captured walk-in/call queries. No auth required.
queriesRouter.post("/", createQuery);

const staffOnly = [authenticate, requireModule("queries"), requireStaff];
const readOnly = [authenticate, requireModule("queries"), requireReadAccess];
queriesRouter.get("/", ...readOnly, listQueries);
queriesRouter.get("/export", ...readOnly, exportQueries);
queriesRouter.get("/:id", ...readOnly, getQuery);
queriesRouter.patch("/:id/assign", ...staffOnly, assignQuery);
queriesRouter.patch("/:id/edit", ...staffOnly, editQuery);
queriesRouter.patch("/:id", ...staffOnly, updateQuery);
queriesRouter.post("/:id/updates", ...staffOnly, addQueryUpdate);
queriesRouter.delete("/:id", authenticate, requireAdmin, deleteQuery);
