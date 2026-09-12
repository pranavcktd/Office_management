import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { asyncHandler } from "../../utils/asyncHandler";

const querySchema = z.object({
  actorKind: z.enum(["staff", "agent", "system"]).optional(),
  entityType: z.string().optional(),
  action: z.string().optional(),
  q: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.coerce.number().int().optional(),
});

export const listAudit = asyncHandler(async (req: Request, res: Response) => {
  const f = querySchema.parse(req.query);
  const limit = f.limit ?? 100;

  const rows = await prisma.auditLog.findMany({
    where: {
      actorKind: f.actorKind,
      entityType: f.entityType,
      action: f.action ? { contains: f.action, mode: "insensitive" } : undefined,
      createdAt: {
        gte: f.from ? new Date(f.from) : undefined,
        lte: f.to ? new Date(f.to) : undefined,
      },
      ...(f.q
        ? {
            OR: [
              { actorName: { contains: f.q, mode: "insensitive" } },
              { action: { contains: f.q, mode: "insensitive" } },
              { entityType: { contains: f.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { id: "desc" },
    take: limit + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

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

  res.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null });
});
