import { Request } from "express";
import { prisma } from "../db/prisma";

interface AuditInput {
  action: string;
  entityType: string;
  entityId: number;
  meta?: unknown;
  /** Override the actor (e.g. for system/scheduled jobs). */
  actor?: { kind: "staff" | "agent" | "system"; id?: number; name?: string };
}

const nameCache = new Map<string, string>();

async function resolveActorName(kind: "staff" | "agent", id: number): Promise<string> {
  const key = `${kind}:${id}`;
  const cached = nameCache.get(key);
  if (cached) return cached;
  let name = `${kind} #${id}`;
  if (kind === "staff") {
    const s = await prisma.staff.findUnique({ where: { id }, select: { fullName: true } });
    if (s) name = s.fullName;
  } else {
    const a = await prisma.agent.findUnique({ where: { id }, select: { agentName: true } });
    if (a) name = a.agentName;
  }
  nameCache.set(key, name);
  return name;
}

/**
 * Records one activity-log row. Non-blocking-safe: never throws — a failed audit write
 * must not break the request it describes.
 */
export async function logAudit(req: Request | null, input: AuditInput): Promise<void> {
  try {
    let actorKind: string = input.actor?.kind ?? "system";
    let actorId: number | null = input.actor?.id ?? null;
    let actorName: string | null = input.actor?.name ?? null;

    if (!input.actor && req?.user) {
      actorKind = req.user.kind;
      actorId = req.user.id;
      actorName = await resolveActorName(req.user.kind, req.user.id);
    } else if (input.actor && input.actor.kind !== "system" && input.actor.id && !actorName) {
      actorName = await resolveActorName(input.actor.kind, input.actor.id);
    }

    await prisma.auditLog.create({
      data: {
        actorKind,
        actorId,
        actorName,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        meta: input.meta === undefined ? undefined : (input.meta as never),
      },
    });
  } catch (err) {
    console.error("[audit] failed to write audit row:", err);
  }
}
