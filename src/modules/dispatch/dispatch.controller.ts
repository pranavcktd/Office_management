import fs from "fs";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { exportPdf, exportXlsx } from "../../utils/export";
import type { ExportColumn } from "../../utils/export";
import { logAudit } from "../../utils/audit";
import { receiptAbsolutePath } from "../../middleware/uploadReceipt";
import { mobileSchema } from "../../utils/validators";
import { paginatedResponse, paginationQuerySchema, toSkipTake } from "../../utils/pagination";

async function assertItemCategory(id: number): Promise<void> {
  const cat = await prisma.masterCategory.findFirst({ where: { id, kind: "DISPATCH_ITEM" } });
  if (!cat) throw new ApiError(400, "Unknown item type category");
}

const bodySchema = z
  .object({
    entryType: z.enum(["INWARD", "OUTWARD"]),
    itemCategoryId: z.number().int(),
    courierAgency: z.enum(["INDIA_POST", "DTDC", "TRACKON", "BY_HAND", "OTHER"]),
    courierOtherDetail: z.string().min(1).optional(),
    courierDetails: z.string().optional(),
    consignmentNumber: z.string().min(1).optional(),
    partyDetails: z.string().min(1),
    mobile: mobileSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.courierAgency === "OTHER" && !data.courierOtherDetail) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["courierOtherDetail"], message: "courierOtherDetail is mandatory when courier agency is Other" });
    }
    if (data.courierAgency !== "BY_HAND" && !data.consignmentNumber) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["consignmentNumber"], message: "consignmentNumber is mandatory unless delivered By Hand" });
    }
  });

const dispatchInclude = {
  handledBy: { select: { id: true, fullName: true } },
  itemCategory: { select: { id: true, name: true } },
} satisfies Prisma.DispatchRegisterInclude;

export const createEntry = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.kind !== "staff") {
    throw new ApiError(403, "Only staff can log register entries");
  }
  const input = bodySchema.parse(req.body);
  await assertItemCategory(input.itemCategoryId);
  const entry = await prisma.dispatchRegister.create({
    data: { ...input, handledById: req.user.id },
    include: dispatchInclude,
  });
  await logAudit(req, { action: "DISPATCH_CREATED", entityType: "dispatch_register", entityId: entry.id });
  res.status(201).json(entry);
});

const listQuerySchema = z.object({
  entryType: z.enum(["INWARD", "OUTWARD"]).optional(),
  itemCategoryId: z.coerce.number().int().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  q: z.string().optional(),
}).merge(paginationQuerySchema);

function buildDispatchWhere(filters: z.infer<typeof listQuerySchema>): Prisma.DispatchRegisterWhereInput {
  const { from, to, q, page: _page, pageSize: _pageSize, ...rest } = filters;
  return {
    ...rest,
    createdAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined },
    ...(q
      ? {
          OR: [
            { partyDetails: { contains: q, mode: "insensitive" } },
            { consignmentNumber: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export const listEntries = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, ...filters } = listQuerySchema.parse(req.query);
  const where = buildDispatchWhere({ ...filters, page, pageSize });
  const [entries, total] = await Promise.all([
    prisma.dispatchRegister.findMany({
      where,
      include: dispatchInclude,
      orderBy: { createdAt: "desc" },
      ...toSkipTake(page, pageSize),
    }),
    prisma.dispatchRegister.count({ where }),
  ]);
  res.json(paginatedResponse(entries, total, page, pageSize));
});

export const getEntry = asyncHandler(async (req: Request, res: Response) => {
  const entry = await prisma.dispatchRegister.findUnique({
    where: { id: Number(req.params.id) },
    include: dispatchInclude,
  });
  if (!entry) throw new ApiError(404, "Register entry not found");
  res.json(entry);
});

export const updateEntry = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const input = bodySchema.parse(req.body);
  await assertItemCategory(input.itemCategoryId);

  const existing = await prisma.dispatchRegister.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Register entry not found");

  const updated = await prisma.dispatchRegister.update({
    where: { id },
    data: input,
    include: dispatchInclude,
  });
  await logAudit(req, { action: "DISPATCH_EDITED", entityType: "dispatch_register", entityId: id });
  res.json(updated);
});

export const deleteEntry = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = await prisma.dispatchRegister.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Register entry not found");
  await prisma.dispatchRegister.delete({ where: { id } });
  if (existing.receiptPath) {
    fs.rm(receiptAbsolutePath(existing.receiptPath), () => undefined);
  }
  await logAudit(req, { action: "DISPATCH_DELETED", entityType: "dispatch_register", entityId: id });
  res.status(204).send();
});

// --- Receipt attachment ---

export const uploadEntryReceipt = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!req.file) throw new ApiError(400, "No file uploaded (field name: 'receipt')");

  const existing = await prisma.dispatchRegister.findUnique({ where: { id } });
  if (!existing) {
    fs.rm(req.file.path, () => undefined);
    throw new ApiError(404, "Register entry not found");
  }

  if (existing.receiptPath) {
    fs.rm(receiptAbsolutePath(existing.receiptPath), () => undefined);
  }

  const relative = `receipts/${req.file.filename}`;
  const updated = await prisma.dispatchRegister.update({
    where: { id },
    data: { receiptPath: relative },
    include: dispatchInclude,
  });
  await logAudit(req, { action: "DISPATCH_RECEIPT_UPLOADED", entityType: "dispatch_register", entityId: id, meta: { filename: req.file.originalname } });
  res.json(updated);
});

export const getEntryReceipt = asyncHandler(async (req: Request, res: Response) => {
  const entry = await prisma.dispatchRegister.findUnique({ where: { id: Number(req.params.id) } });
  if (!entry?.receiptPath) throw new ApiError(404, "No receipt on this entry");
  const abs = receiptAbsolutePath(entry.receiptPath);
  if (!fs.existsSync(abs)) throw new ApiError(404, "Receipt file is missing");
  res.sendFile(abs);
});

export const deleteEntryReceipt = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const entry = await prisma.dispatchRegister.findUnique({ where: { id } });
  if (!entry?.receiptPath) throw new ApiError(404, "No receipt on this entry");
  fs.rm(receiptAbsolutePath(entry.receiptPath), () => undefined);
  await prisma.dispatchRegister.update({ where: { id }, data: { receiptPath: null } });
  await logAudit(req, { action: "DISPATCH_RECEIPT_DELETED", entityType: "dispatch_register", entityId: id });
  res.status(204).send();
});

const exportQuerySchema = listQuerySchema;

export const exportEntries = asyncHandler(async (req: Request, res: Response) => {
  const format = req.query.format === "pdf" ? "pdf" : "xlsx";
  const filters = exportQuerySchema.parse(req.query);

  const entries = await prisma.dispatchRegister.findMany({
    where: buildDispatchWhere(filters),
    include: dispatchInclude,
    orderBy: { createdAt: "desc" },
  });

  const columns: ExportColumn<(typeof entries)[number]>[] = [
    { header: "ID", value: (r) => String(r.id) },
    { header: "Type", value: (r) => r.entryType },
    { header: "Item", value: (r) => r.itemCategory?.name ?? "" },
    { header: "Consignment #", value: (r) => r.consignmentNumber ?? "" },
    { header: "Courier", value: (r) => (r.courierAgency === "OTHER" && r.courierOtherDetail ? r.courierOtherDetail : r.courierAgency ?? "") },
    { header: "Party", value: (r) => r.partyDetails },
    { header: "Mobile", value: (r) => r.mobile ?? "" },
    { header: "Courier Details", value: (r) => r.courierDetails ?? "" },
    { header: "Receipt", value: (r) => (r.receiptPath ? "yes" : "") },
    { header: "Handled By", value: (r) => r.handledBy.fullName },
    { header: "Date & Time", value: (r) => r.createdAt.toISOString() },
  ];

  if (format === "pdf") {
    exportPdf(res, "dispatch-register", "Inward / Outward Register", columns, entries);
  } else {
    await exportXlsx(res, "dispatch-register", columns, entries);
  }
});
