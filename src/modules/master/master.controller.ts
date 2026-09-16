import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { logAudit } from "../../utils/audit";
import { QUERY_EXTRA_FIELDS } from "../../utils/queryExtraFields";

const kindSchema = z.enum(["SERVICE", "DISPATCH_ITEM"]);

function parseKind(raw: unknown): "SERVICE" | "DISPATCH_ITEM" {
  const r = kindSchema.safeParse(raw);
  if (!r.success) throw new ApiError(400, "kind must be SERVICE or DISPATCH_ITEM");
  return r.data;
}

export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  const kind = parseKind(req.params.kind);
  const includeInactive = req.query.includeInactive === "true";
  const categories = await prisma.masterCategory.findMany({
    where: { kind, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  res.json(categories);
});

const upsertSchema = z.object({
  name: z.string().min(1).max(100),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  // SERVICE categories only — see queries.controller.ts for how these gate the query entry form.
  requiredQueryFields: z.array(z.enum(QUERY_EXTRA_FIELDS)).optional(),
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const kind = parseKind(req.params.kind);
  const input = upsertSchema.parse(req.body);
  try {
    const category = await prisma.masterCategory.create({
      data: {
        kind,
        name: input.name.trim(),
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
        requiredQueryFields: kind === "SERVICE" ? input.requiredQueryFields ?? [] : [],
      },
    });
    await logAudit(req, { action: "MASTER_CATEGORY_CREATED", entityType: "master_categories", entityId: category.id, meta: { kind, name: category.name } });
    res.status(201).json(category);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ApiError(409, `"${input.name}" already exists in this list`);
    }
    throw err;
  }
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const input = upsertSchema.partial().parse(req.body);
  try {
    const category = await prisma.masterCategory.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        isActive: input.isActive,
        sortOrder: input.sortOrder,
        requiredQueryFields: input.requiredQueryFields,
      },
    });
    await logAudit(req, { action: "MASTER_CATEGORY_UPDATED", entityType: "master_categories", entityId: id, meta: input });
    res.json(category);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") throw new ApiError(409, "Another entry with this name already exists");
      if (err.code === "P2025") throw new ApiError(404, "Category not found");
    }
    throw err;
  }
});

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [queryUse, dispatchUse] = await Promise.all([
    prisma.clientQuery.count({ where: { serviceCategoryId: id } }),
    prisma.dispatchRegister.count({ where: { itemCategoryId: id } }),
  ]);
  if (queryUse > 0 || dispatchUse > 0) {
    throw new ApiError(409, "This category is used by existing records — deactivate it instead of deleting");
  }
  try {
    await prisma.masterCategory.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw new ApiError(404, "Category not found");
    }
    throw err;
  }
  await logAudit(req, { action: "MASTER_CATEGORY_DELETED", entityType: "master_categories", entityId: id });
  res.status(204).send();
});
