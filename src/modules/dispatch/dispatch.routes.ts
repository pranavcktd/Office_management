import { Router } from "express";
import { requireAdmin, requireReadAccess, requireStaff } from "../../middleware/auth";
import { uploadReceipt } from "../../middleware/uploadReceipt";
import {
  createEntry,
  deleteEntry,
  deleteEntryReceipt,
  exportEntries,
  getEntry,
  getEntryReceipt,
  listEntries,
  updateEntry,
  uploadEntryReceipt,
} from "./dispatch.controller";

export const dispatchRouter = Router();

dispatchRouter.get("/", requireReadAccess, listEntries);
dispatchRouter.get("/export", requireReadAccess, exportEntries);
dispatchRouter.get("/:id", requireReadAccess, getEntry);
dispatchRouter.get("/:id/receipt", requireReadAccess, getEntryReceipt);
dispatchRouter.post("/", requireStaff, createEntry);
dispatchRouter.post("/:id/receipt", requireStaff, uploadReceipt.single("receipt"), uploadEntryReceipt);
dispatchRouter.patch("/:id", requireAdmin, updateEntry);
dispatchRouter.delete("/:id/receipt", requireStaff, deleteEntryReceipt);
dispatchRouter.delete("/:id", requireAdmin, deleteEntry);
