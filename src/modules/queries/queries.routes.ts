import { Router } from "express";
import { authenticate, requireAdmin, requireModule, requireStaff } from "../../middleware/auth";
import {
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
queriesRouter.get("/", ...staffOnly, listQueries);
queriesRouter.get("/export", ...staffOnly, exportQueries);
queriesRouter.get("/:id", ...staffOnly, getQuery);
queriesRouter.patch("/:id/assign", ...staffOnly, assignQuery);
queriesRouter.patch("/:id/edit", ...staffOnly, editQuery);
queriesRouter.patch("/:id", ...staffOnly, updateQuery);
queriesRouter.delete("/:id", authenticate, requireAdmin, deleteQuery);
