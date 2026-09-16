import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { paginatedResponse, paginationQuerySchema } from "../../utils/pagination";

const querySchema = z
  .object({
    actorKind: z.enum(["staff", "agent", "system"]).optional(),
    entityType: z.string().optional(),
    action: z.string().optional(),
    q: z.string().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .merge(paginationQuerySchema);

export const listAudit = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, ...f } = querySchema.parse(req.query);

  const where = {
    actorKind: f.actorKind,
    entityType: f.entityType,
    action: f.action ? { contains: f.action, mode: "insensitive" as const } : undefined,
    createdAt: {
      gte: f.from ? new Date(f.from) : undefined,
      lte: f.to ? new Date(f.to) : undefined,
    },
    ...(f.q
      ? {
          OR: [
            { actorName: { contains: f.q, mode: "insensitive" as const } },
            { action: { contains: f.q, mode: "insensitive" as const } },
            { entityType: { contains: f.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  // Backfill actorName for older rows that only stored actorId (staff).
  const missingIds = [
    ...new Set(items.filter((r) => !r.actorName && r.actorKind === "staff" && r.actorId).map((r) => r.actorId!)),
  ];
  if (missingIds.length) {
    const staff = await prisma.staff.findMany({
      where: { id: { in: missingIds } },
      select: { id: true, fullName: true },
    });
    const nameById = new Map(staff.map((s) => [s.id, s.fullName]));
    for (const r of items) {
      if (!r.actorName && r.actorId && nameById.has(r.actorId)) r.actorName = nameById.get(r.actorId)!;
    }
  }

  res.json(paginatedResponse(items, total, page, pageSize));
});
