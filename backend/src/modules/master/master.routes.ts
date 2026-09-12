import { Router } from "express";
import { requireAdmin, requireStaff } from "../../middleware/auth";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "./master.controller";

export const masterRouter = Router();

// Any authenticated staff can read the lists (needed by the entry forms).
masterRouter.get("/:kind", requireStaff, listCategories);
// Creating a new value inline from an entry form is allowed for any staff; edits/deletes are admin.
masterRouter.post("/:kind", requireStaff, createCategory);
masterRouter.patch("/:id", requireAdmin, updateCategory);
masterRouter.delete("/:id", requireAdmin, deleteCategory);
