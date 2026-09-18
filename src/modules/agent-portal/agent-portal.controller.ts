import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { logAudit } from "../../utils/audit";
import { decryptAadhaar } from "../../utils/crypto";
import { paginatedResponse, paginationQuerySchema } from "../../utils/pagination";
import { computeFeeDueFromAgent } from "../agents/agents.controller";

// Resolves which agent's portal is being read: the agent themselves (self-service routes,
// req.user), or — for the admin's read-only "view agent portal" feature — whichever agent the
// admin-only route names in :agentId. Never both; the two route trees are mounted separately.
function agentId(req: Request): number {
  if (req.params.agentId) {
    return Number(req.params.agentId);
  }
  if (!req.user || req.user.kind !== "agent") {
    throw new ApiError(403, "Agent portal is for agent accounts only");
  }
  return req.user.id;
}

export const getSummary = asyncHandler(async (req: Request, res: Response) => {
  const id = agentId(req);

  const agent = await prisma.agent.findUnique({
    where: { id },
    select: { id: true, agentName: true, firmName: true, mobile: true, email: true, address: true },
  });
  if (!agent) throw new ApiError(404, "Agent not found");

  const [
    panSubmitted,
    panAccepted,
    panRejected,
    panUnderEntry,
    panCredits,
    tanSubmitted,
    tanAccepted,
    tanRejected,
    tanUnderEntry,
    tanCredits,
    openQueries,
    feeDueFromAgent,
  ] = await Promise.all([
    prisma.panApplication.count({ where: { agentId: id } }),
    prisma.panApplication.count({ where: { agentId: id, status: "ACK_GENERATED" } }),
    prisma.panApplication.count({ where: { agentId: id, status: "REJECTED" } }),
    prisma.panApplication.count({ where: { agentId: id, status: "UNDER_ENTRY" } }),
    prisma.panApplication.count({ where: { agentId: id, adjustmentAvailable: true } }),
    prisma.tanApplication.count({ where: { agentId: id } }),
    prisma.tanApplication.count({ where: { agentId: id, status: "ACK_GENERATED" } }),
    prisma.tanApplication.count({ where: { agentId: id, status: "REJECTED" } }),
    prisma.tanApplication.count({ where: { agentId: id, status: "UNDER_ENTRY" } }),
    prisma.tanApplication.count({ where: { agentId: id, adjustmentAvailable: true } }),
    prisma.clientQuery.count({ where: { submittedByAgentId: id, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    // Positive = the agent owes the office (collected less than the fixed fee); negative = the
    // office owes the agent — same calculation staff see on the agent's own ledger page, shared
    // rather than duplicated so both stay in sync (see agents.controller.ts's comment on this
    // function for what it excludes and why).
    computeFeeDueFromAgent(id),
  ]);

  res.json({
    agent,
    ledger: {
      forms: {
        submitted: panSubmitted + tanSubmitted,
        accepted: panAccepted + tanAccepted,
        rejected: panRejected + tanRejected,
        underEntry: panUnderEntry + tanUnderEntry,
      },
      adjustmentBalance: panCredits + tanCredits,
      feeDueFromAgent,
      breakdown: {
        pan: { submitted: panSubmitted, accepted: panAccepted, rejected: panRejected, underEntry: panUnderEntry, adjustmentAvailable: panCredits },
        tan: { submitted: tanSubmitted, accepted: tanAccepted, rejected: tanRejected, underEntry: tanUnderEntry, adjustmentAvailable: tanCredits },
      },
    },
    openQueries,
  });
});

const listApplicationsQuerySchema = z
  .object({
    status: z.enum(["UNDER_ENTRY", "PUSHED_TO_NSDL", "ACK_GENERATED", "REJECTED"]).optional(),
    module: z.enum(["PAN", "TAN", "ALL"]).default("ALL"),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    q: z.string().optional(),
  })
  .merge(paginationQuerySchema);

const applicationSelect = {
  id: true,
  applicationType: true,
  applicantName: true,
  mobile: true,
  feeAmount: true,
  standardFeeAmount: true,
  paymentMode: true,
  status: true,
  rejectionReason: true,
  rejectionOtherDetail: true,
  rejectionDate: true,
  adjustmentAvailable: true,
  adjustmentExpiredAt: true,
  adjustedFromFormId: true,
  formReceivedDate: true,
  createdAt: true,
} as const;

export const listApplications = asyncHandler(async (req: Request, res: Response) => {
  const id = agentId(req);
  const { status, module, dateFrom, dateTo, q, page, pageSize } = listApplicationsQuerySchema.parse(req.query);
  const formReceivedDate =
    dateFrom || dateTo
      ? {
          gte: dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`) : undefined,
          lte: dateTo ? new Date(`${dateTo}T23:59:59.999Z`) : undefined,
        }
      : undefined;
  const search = q ? { OR: [{ applicantName: { contains: q, mode: "insensitive" as const } }, { mobile: { contains: q } }] } : {};

  const rows: Array<{ module: "PAN" | "TAN" } & Record<string, unknown>> = [];

  // Rejected forms can be Available / Time Barred / Used, mirroring the same 3-state credit
  // logic the office's own Reports module uses — meaningful only when status is REJECTED.
  const creditStatusOf = (r: { adjustmentAvailable: boolean; adjustmentExpiredAt: Date | null; adjustedTo: { id: number } | null }) => {
    if (r.adjustmentAvailable) return "AVAILABLE" as const;
    if (r.adjustedTo) return "USED" as const;
    return "TIME_BARRED" as const;
  };

  if (module === "PAN" || module === "ALL") {
    const pan = await prisma.panApplication.findMany({
      where: { agentId: id, status, ...(formReceivedDate ? { formReceivedDate } : {}), ...search },
      select: { ...applicationSelect, ackNumber: true, adjustedTo: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
    });
    rows.push(...pan.map(({ adjustedTo, ...r }) => ({ ...r, module: "PAN" as const, creditStatus: r.status === "REJECTED" ? creditStatusOf({ ...r, adjustedTo }) : null })));
  }
  if (module === "TAN" || module === "ALL") {
    const tan = await prisma.tanApplication.findMany({
      where: { agentId: id, status, ...(formReceivedDate ? { formReceivedDate } : {}), ...search },
      select: { ...applicationSelect, ackNumber: true, adjustedTo: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
    });
    rows.push(...tan.map(({ adjustedTo, ...r }) => ({ ...r, module: "TAN" as const, creditStatus: r.status === "REJECTED" ? creditStatusOf({ ...r, adjustedTo }) : null })));
  }

  rows.sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());
  const start = (page - 1) * pageSize;
  res.json(paginatedResponse(rows.slice(start, start + pageSize), rows.length, page, pageSize));
});

export const getApplicationDetail = asyncHandler(async (req: Request, res: Response) => {
  const id = agentId(req);
  const module = req.params.module === "TAN" ? "TAN" : req.params.module === "PAN" ? "PAN" : null;
  const appId = Number(req.params.id);
  if (!module) throw new ApiError(400, "module must be PAN or TAN");

  // Both directions of the adjustment trail: which rejected form this one's credit came from
  // (adjustedFrom), and — if this one is itself a rejected form — which new application used
  // its credit (adjustedTo). Adjustment credits are always scoped to the same agent, so an
  // agent viewing either side is always looking at their own data.
  const application =
    module === "PAN"
      ? await prisma.panApplication.findFirst({
          where: { id: appId, agentId: id },
          include: {
            createdBy: { select: { id: true, fullName: true } },
            adjustedFrom: { select: { id: true, applicantName: true, rejectionReason: true, rejectionDate: true } },
            adjustedTo: { select: { id: true, applicantName: true, createdAt: true } },
          },
        })
      : await prisma.tanApplication.findFirst({
          where: { id: appId, agentId: id },
          include: {
            createdBy: { select: { id: true, fullName: true } },
            adjustedFrom: { select: { id: true, applicantName: true, rejectionReason: true, rejectionDate: true } },
            adjustedTo: { select: { id: true, applicantName: true, createdAt: true } },
          },
        });
  if (!application) throw new ApiError(404, "Application not found");

  // The full application, minus the raw encrypted/hash Aadhaar columns — replaced with the
  // decrypted number itself so the agent sees the same full detail an office admin would (this
  // is the applicant's own data the agent collected and submitted in the first place).
  const { aadhaarEncrypted, aadhaarHash, ...rest } = application as typeof application & {
    aadhaarEncrypted?: string | null;
    aadhaarHash?: string | null;
  };
  res.json({
    ...rest,
    module,
    ...(aadhaarEncrypted !== undefined ? { aadhaarNumber: aadhaarEncrypted ? decryptAadhaar(aadhaarEncrypted) : null } : {}),
  });
});

const querySelect = {
  id: true,
  serviceCategory: { select: { id: true, name: true } },
  queryText: true,
  responseText: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const listMyQueries = asyncHandler(async (req: Request, res: Response) => {
  const id = agentId(req);
  const queries = await prisma.clientQuery.findMany({
    where: { submittedByAgentId: id },
    select: querySelect,
    orderBy: { createdAt: "desc" },
  });
  res.json(queries);
});

export const listServiceCategories = asyncHandler(async (_req: Request, res: Response) => {
  const cats = await prisma.masterCategory.findMany({
    where: { kind: "SERVICE", isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  res.json(cats);
});

const createQuerySchema = z.object({
  serviceCategoryId: z.number().int(),
  queryText: z.string().min(1),
});

export const createMyQuery = asyncHandler(async (req: Request, res: Response) => {
  const id = agentId(req);
  const input = createQuerySchema.parse(req.body);

  const [agent, category] = await Promise.all([
    prisma.agent.findUnique({ where: { id } }),
    prisma.masterCategory.findFirst({ where: { id: input.serviceCategoryId, kind: "SERVICE" } }),
  ]);
  if (!agent) throw new ApiError(404, "Agent not found");
  if (!category) throw new ApiError(400, "Unknown service category");

  const query = await prisma.clientQuery.create({
    data: {
      clientName: agent.agentName,
      mobile: agent.mobile,
      email: agent.email,
      serviceCategoryId: input.serviceCategoryId,
      queryText: input.queryText,
      submittedByAgentId: id,
    },
    select: querySelect,
  });
  await logAudit(req, { action: "QUERY_CREATED", entityType: "client_queries", entityId: query.id });
  res.status(201).json(query);
});

// ---------------------------------------------------------------------------
// Notifications — one-way admin -> agent messages (see agents.controller.ts's bulk-notify
// endpoint for how these get created). Newest first; the unread count lets the portal shell
// show a badge without fetching the full list.
// ---------------------------------------------------------------------------

export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  const id = agentId(req);
  const notifications = await prisma.agentNotification.findMany({
    where: { agentId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const unreadCount = notifications.filter((n) => !n.readAt).length;
  res.json({ notifications, unreadCount });
});

/** Agent-only — marking a notification read isn't something the admin's read-only "view as
 * agent" should ever trigger on the agent's behalf. */
export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.kind !== "agent") {
    throw new ApiError(403, "Agent portal is for agent accounts only");
  }
  const id = Number(req.params.id);
  const notification = await prisma.agentNotification.findUnique({ where: { id } });
  if (!notification || notification.agentId !== req.user.id) {
    throw new ApiError(404, "Notification not found");
  }
  const updated = await prisma.agentNotification.update({
    where: { id },
    data: { readAt: notification.readAt ?? new Date() },
  });
  res.json(updated);
});
