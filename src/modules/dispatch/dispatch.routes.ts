import { Router } from "express";
import { requireAdmin, requireStaff } from "../../middleware/auth";
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

dispatchRouter.get("/", requireStaff, listEntries);
dispatchRouter.get("/export", requireStaff, exportEntries);
dispatchRouter.get("/:id", requireStaff, getEntry);
dispatchRouter.get("/:id/receipt", requireStaff, getEntryReceipt);
dispatchRouter.post("/", requireStaff, createEntry);
dispatchRouter.post("/:id/receipt", requireStaff, uploadReceipt.single("receipt"), uploadEntryReceipt);
dispatchRouter.patch("/:id", requireAdmin, updateEntry);
dispatchRouter.delete("/:id/receipt", requireStaff, deleteEntryReceipt);
dispatchRouter.delete("/:id", requireAdmin, deleteEntry);
