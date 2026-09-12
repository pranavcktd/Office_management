import fs from "fs";
import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { logAudit } from "../../utils/audit";
import { documentAbsolutePath } from "../../middleware/uploadDocument";
import { paginatedResponse, paginationQuerySchema, toSkipTake } from "../../utils/pagination";

const documentInclude = { uploadedBy: { select: { id: true, fullName: true } } };

// The agent portal's document library fetches the full list (it's a small reference set) and
// expects a plain array — pagination only kicks in when a caller explicitly asks via ?page=.
export const listDocuments = asyncHandler(async (req: Request, res: Response) => {
  if (req.query.page === undefined) {
    const documents = await prisma.document.findMany({ orderBy: { createdAt: "desc" }, include: documentInclude });
    res.json(documents);
    return;
  }

  const { page, pageSize } = paginationQuerySchema.parse(req.query);
  const [documents, total] = await Promise.all([
    prisma.document.findMany({ orderBy: { createdAt: "desc" }, include: documentInclude, ...toSkipTake(page, pageSize) }),
    prisma.document.count(),
  ]);
  res.json(paginatedResponse(documents, total, page, pageSize));
});

const uploadSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
});

export const uploadDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(400, "No file uploaded (field name: 'file')");
  const input = uploadSchema.parse(req.body);

  const doc = await prisma.document.create({
    data: {
      title: input.title,
      description: input.description || null,
      filePath: `documents/${req.file.filename}`,
      originalName: req.file.originalname,
      uploadedById: req.user?.kind === "staff" ? req.user.id : null,
    },
    include: { uploadedBy: { select: { id: true, fullName: true } } },
  });
  await logAudit(req, { action: "DOCUMENT_UPLOADED", entityType: "documents", entityId: doc.id, meta: { title: doc.title } });
  res.status(201).json(doc);
});

export const downloadDocument = asyncHandler(async (req: Request, res: Response) => {
  const doc = await prisma.document.findUnique({ where: { id: Number(req.params.id) } });
  if (!doc) throw new ApiError(404, "Document not found");
  const abs = documentAbsolutePath(doc.filePath);
  if (!fs.existsSync(abs)) throw new ApiError(404, "Document file is missing");
  res.download(abs, doc.originalName);
});

export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) throw new ApiError(404, "Document not found");
  fs.rm(documentAbsolutePath(doc.filePath), () => undefined);
  await prisma.document.delete({ where: { id } });
  await logAudit(req, { action: "DOCUMENT_DELETED", entityType: "documents", entityId: id, meta: { title: doc.title } });
  res.status(204).send();
});
