import { Router } from "express";
import { requireAdmin } from "../../middleware/auth";
import { uploadDocument } from "../../middleware/uploadDocument";
import { deleteDocument, downloadDocument, listDocuments, uploadDocumentHandler } from "./documents.controller";

export const documentsRouter = Router();

// Any authenticated principal (staff or agent) can browse and download.
documentsRouter.get("/", listDocuments);
documentsRouter.get("/:id/download", downloadDocument);
documentsRouter.post("/", requireAdmin, uploadDocument.single("file"), uploadDocumentHandler);
documentsRouter.delete("/:id", requireAdmin, deleteDocument);
