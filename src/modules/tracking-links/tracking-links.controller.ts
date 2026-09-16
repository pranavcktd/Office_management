import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { ApiError, asyncHandler } from "../../utils/asyncHandler";
import { logAudit } from "../../utils/audit";

const moduleSchema = z.enum(["PAN", "TAN", "DISPATCH"]);

function parseModule(raw: unknown): "PAN" | "TAN" | "DISPATCH" {
  const r = moduleSchema.safeParse(raw);
  if (!r.success) throw new ApiError(400, "module must be PAN, TAN, or DISPATCH");
  return r.data;
}

// Any authenticated principal (staff, auditor, or agent) can read the active links for a
// module — this is what actually drives the "Track Application" button, so it must work for
// whoever is looking at a PAN/TAN/Dispatch entry, not just staff.
export const listTrackingLinks = asyncHandler(async (req: Request, res: Response) => {
  const module = parseModule(req.params.module);
  const includeInactive = req.user?.kind === "staff" && req.user.role === "ADMIN" && req.query.includeInactive === "true";
  const links = await prisma.trackingLink.findMany({
    where: { module, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  res.json(links);
});

const upsertSchema = z.object({
  label: z.string().min(1).max(100),
  url: z.string().url(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const createTrackingLink = asyncHandler(async (req: Request, res: Response) => {
  const module = parseModule(req.params.module);
  const input = upsertSchema.parse(req.body);
  const link = await prisma.trackingLink.create({
    data: { module, label: input.label.trim(), url: input.url, isActive: input.isActive ?? true, sortOrder: input.sortOrder ?? 0 },
  });
  await logAudit(req, { action: "TRACKING_LINK_CREATED", entityType: "tracking_links", entityId: link.id, meta: { module, label: link.label } });
  res.status(201).json(link);
});

export const updateTrackingLink = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const input = upsertSchema.partial().parse(req.body);
  const link = await prisma.trackingLink.update({
    where: { id },
    data: {
      label: input.label?.trim(),
      url: input.url,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    },
  }).catch(() => {
    throw new ApiError(404, "Tracking link not found");
  });
  await logAudit(req, { action: "TRACKING_LINK_UPDATED", entityType: "tracking_links", entityId: id, meta: input });
  res.json(link);
});

export const deleteTrackingLink = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  await prisma.trackingLink.delete({ where: { id } }).catch(() => {
    throw new ApiError(404, "Tracking link not found");
  });
  await logAudit(req, { action: "TRACKING_LINK_DELETED", entityType: "tracking_links", entityId: id });
  res.status(204).send();
});
