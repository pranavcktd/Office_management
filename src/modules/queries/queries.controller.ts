import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { exportPdf, exportXlsx } from "../../utils/export";
import type { ExportColumn } from "../../utils/export";
import { mobileSchema } from "../../utils/validators";
import { logAudit } from "../../utils/audit";
import { decryptAadhaar, encryptAadhaar } from "../../utils/crypto";
import { paginatedResponse, paginationQuerySchema, toSkipTake } from "../../utils/pagination";
import { QUERY_EXTRA_FIELD_LABELS } from "../../utils/queryExtraFields";
import type { QueryExtraField } from "../../utils/queryExtraFields";

async function getServiceCategory(id: number) {
  const cat = await prisma.masterCategory.findFirst({ where: { id, kind: "SERVICE" } });
  if (!cat) throw new ApiError(400, "Unknown service category");
  return cat;
}

// A category can mark panNumber/aadhaarNumber/taxYear mandatory (e.g. "Aadhaar-PAN Link
// Request" needs PAN + Aadhaar) — see MasterCategory.requiredQueryFields, admin-configured under
// Settings → Categories. Checked here rather than in a zod superRefine since it depends on the
// DB row for whichever category was actually selected.
function assertRequiredQueryFields(
  requiredFields: string[],
  input: { panNumber?: string; aadhaarNumber?: string; taxYear?: string }
) {
  const present: Record<QueryExtraField, boolean> = {
    PAN: Boolean(input.panNumber),
    AADHAAR: Boolean(input.aadhaarNumber),
    TAX_YEAR: Boolean(input.taxYear),
  };
  for (const field of requiredFields) {
    if (field in present && !present[field as QueryExtraField]) {
      throw new ApiError(400, `${QUERY_EXTRA_FIELD_LABELS[field as QueryExtraField]} is mandatory for this service category`);
    }
  }
}

const extraFieldsShape = {
  panNumber: z.string().length(10).optional(),
  aadhaarNumber: z.string().regex(/^\d{12}$/, "aadhaarNumber must be 12 digits").optional(),
  taxYear: z.string().min(1).optional(),
};

function extraFieldsData(input: { panNumber?: string; aadhaarNumber?: string; taxYear?: string }) {
  return {
    panNumber: input.panNumber || undefined,
    aadhaarEncrypted: input.aadhaarNumber ? encryptAadhaar(input.aadhaarNumber) : undefined,
    aadhaarLast4: input.aadhaarNumber ? input.aadhaarNumber.slice(-4) : undefined,
    taxYear: input.taxYear || undefined,
  };
}

/** Never sent as an editable pre-fill (same reasoning as PAN's aadhaarNumber) — just a decrypted
 * read-only value for detail/list views. */
function withAadhaarNumber<T extends { aadhaarEncrypted?: string | null }>(query: T) {
  const { aadhaarEncrypted, ...rest } = query;
  return { ...rest, aadhaarNumber: aadhaarEncrypted ? decryptAadhaar(aadhaarEncrypted) : null };
}

const createSchema = z.object({
  clientName: z.string().min(1),
  mobile: mobileSchema,
  email: z.string().email().optional(),
  serviceCategoryId: z.number().int(),
  queryText: z.string().min(1),
  ...extraFieldsShape,
});

// Open intake: walk-in/call capture by staff, or an online web inquiry submitted without auth.
export const createQuery = asyncHandler(async (req: Request, res: Response) => {
  const input = createSchema.parse(req.body);
  const category = await getServiceCategory(input.serviceCategoryId);
  assertRequiredQueryFields(category.requiredQueryFields, input);

  const { panNumber, aadhaarNumber, taxYear, ...rest } = input;
  const query = await prisma.clientQuery.create({
    data: { ...rest, ...extraFieldsData(input) },
    include: queryInclude,
  });
  await logAudit(req, { action: "QUERY_CREATED", entityType: "client_queries", entityId: query.id });
  res.status(201).json(withAadhaarNumber(query));
});

const listQuerySchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  assignedTo: z.coerce.number().int().optional(),
  serviceCategoryId: z.coerce.number().int().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().optional(),
}).merge(paginationQuerySchema);

function buildQueryWhere(filters: z.infer<typeof listQuerySchema>): Prisma.ClientQueryWhereInput {
  const { assignedTo, from, to, q, page: _page, pageSize: _pageSize, ...rest } = filters;
  return {
    ...rest,
    assignedToId: assignedTo,
    ...(from || to
      ? {
          createdAt: {
            gte: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
            lte: to ? new Date(`${to}T23:59:59.999Z`) : undefined,
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { clientName: { contains: q, mode: "insensitive" } },
            { mobile: { contains: q } },
            { queryText: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

const queryInclude = {
  assignedTo: { select: { id: true, fullName: true } },
  serviceCategory: { select: { id: true, name: true } },
} satisfies Prisma.ClientQueryInclude;

export const listQueries = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, ...filters } = listQuerySchema.parse(req.query);
  const where = buildQueryWhere({ ...filters, page, pageSize });
  const [queries, total] = await Promise.all([
    prisma.clientQuery.findMany({
      where,
      include: queryInclude,
      orderBy: { createdAt: "desc" },
      ...toSkipTake(page, pageSize),
    }),
    prisma.clientQuery.count({ where }),
  ]);
  res.json(paginatedResponse(queries.map(withAadhaarNumber), total, page, pageSize));
});

export const getQuery = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [query, auditTrail, updates] = await Promise.all([
    prisma.clientQuery.findUnique({ where: { id }, include: queryInclude }),
    prisma.auditLog.findMany({
      where: { entityType: "client_queries", entityId: id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.queryUpdate.findMany({
      where: { queryId: id },
      include: { createdBy: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!query) throw new ApiError(404, "Query not found");
  res.json({ ...withAadhaarNumber(query), auditTrail, updates });
});

const assignSchema = z.object({ assignedToId: z.number().int() });

export const assignQuery = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { assignedToId } = assignSchema.parse(req.body);

  const existing = await prisma.clientQuery.findUnique({ where: { id }, select: { assignedToId: true } });
  if (!existing) throw new ApiError(404, "Query not found");
  assertOwnsQuery(req, existing.assignedToId, "reassign it");

  const query = await prisma.clientQuery.update({ where: { id }, data: { assignedToId }, include: queryInclude });
  await logAudit(req, { action: "QUERY_ASSIGNED", entityType: "client_queries", entityId: id, meta: { assignedToId } });
  res.json(query);
});

// Full edit of the query itself (client details / category / text) — matches the SRS
// "after entering query also option to edit".
const editSchema = z.object({
  clientName: z.string().min(1),
  mobile: mobileSchema,
  email: z.string().email().optional().or(z.literal("")),
  serviceCategoryId: z.number().int(),
  queryText: z.string().min(1),
  ...extraFieldsShape,
});

export const editQuery = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const input = editSchema.parse(req.body);
  const category = await getServiceCategory(input.serviceCategoryId);
  const existing = await prisma.clientQuery.findUnique({ where: { id }, select: { aadhaarEncrypted: true, assignedToId: true } });
  if (!existing) throw new ApiError(404, "Query not found");
  assertOwnsQuery(req, existing.assignedToId, "edit it");
  // Aadhaar's plaintext is never sent back to the client to pre-fill (same as PAN's own
  // aadhaarNumber on edit), so a blank field here means "unchanged," not "missing" — required-
  // ness is satisfied by an existing encrypted value just as much as a freshly typed one.
  assertRequiredQueryFields(category.requiredQueryFields, {
    ...input,
    aadhaarNumber: input.aadhaarNumber || (existing.aadhaarEncrypted ? "unchanged" : undefined),
  });

  const query = await prisma.clientQuery.update({
    where: { id },
    data: {
      clientName: input.clientName,
      mobile: input.mobile,
      email: input.email || null,
      serviceCategoryId: input.serviceCategoryId,
      queryText: input.queryText,
      ...extraFieldsData(input),
    },
    include: queryInclude,
  });
  await logAudit(req, { action: "QUERY_EDITED", entityType: "client_queries", entityId: id });
  res.json(withAadhaarNumber(query));
});

// Once a query is assigned, several actions are reserved for that one staff member (or an
// admin): closing it, reassigning it to someone else, and editing its details. Anyone else on
// the team can still see it and post updates (moving it through Open/In Progress/Resolved), but
// ownership of "reassign / edit / close" stays with whoever it's on. An unassigned query has no
// one to defer to yet, so none of this applies until someone's actually on the hook for it.
function assertOwnsQuery(req: Request, assignedToId: number | null, action: string) {
  if (req.user?.role === "ADMIN") return;
  if (!assignedToId) return;
  const staffId = req.user?.kind === "staff" ? req.user.id : null;
  if (staffId !== assignedToId) {
    throw new ApiError(403, `Only the staff member this query is assigned to (or an admin) can ${action}.`);
  }
}

const updateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  responseText: z.string().optional(),
});

export const updateQuery = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const input = updateSchema.parse(req.body);

  if (input.status === "CLOSED") {
    const existing = await prisma.clientQuery.findUnique({ where: { id }, select: { assignedToId: true } });
    if (!existing) throw new ApiError(404, "Query not found");
    assertOwnsQuery(req, existing.assignedToId, "close it");
  }

  const query = await prisma.clientQuery.update({
    where: { id },
    data: { status: input.status, responseText: input.responseText },
    include: queryInclude,
  });
  await logAudit(req, { action: "QUERY_UPDATED", entityType: "client_queries", entityId: id, meta: input });
  res.json(query);
});

const addUpdateSchema = z.object({
  message: z.string().min(1),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
});

// The client-facing follow-up thread — each call appends a new timestamped entry rather than
// overwriting anything, so the full history survives (see QueryUpdate's schema comment).
// responseText keeps mirroring the latest message for callers that only care about "the current
// answer" (the agent portal's own summary view, exports) without needing the full thread.
export const addQueryUpdate = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const input = addUpdateSchema.parse(req.body);
  const staffId = req.user?.kind === "staff" ? req.user.id : null;

  const existing = await prisma.clientQuery.findUnique({ where: { id }, select: { id: true, assignedToId: true } });
  if (!existing) throw new ApiError(404, "Query not found");
  if (input.status === "CLOSED") assertOwnsQuery(req, existing.assignedToId, "close it");

  const [update] = await prisma.$transaction([
    prisma.queryUpdate.create({
      data: { queryId: id, message: input.message, statusAtUpdate: input.status, createdById: staffId },
      include: { createdBy: { select: { id: true, fullName: true } } },
    }),
    prisma.clientQuery.update({
      where: { id },
      data: { responseText: input.message, status: input.status },
    }),
  ]);

  await logAudit(req, { action: "QUERY_UPDATE_ADDED", entityType: "client_queries", entityId: id, meta: input });
  res.status(201).json(update);
});

export const deleteQuery = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    await prisma.clientQuery.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw new ApiError(404, "Query not found");
    }
    throw err;
  }
  await logAudit(req, { action: "QUERY_DELETED", entityType: "client_queries", entityId: id });
  res.status(204).send();
});

const exportQuerySchema = listQuerySchema;

export const exportQueries = asyncHandler(async (req: Request, res: Response) => {
  const format = req.query.format === "pdf" ? "pdf" : "xlsx";
  const filters = exportQuerySchema.parse(req.query);

  const queries = await prisma.clientQuery.findMany({
    where: buildQueryWhere(filters),
    include: queryInclude,
    orderBy: { createdAt: "desc" },
  });

  const columns: ExportColumn<(typeof queries)[number]>[] = [
    { header: "ID", value: (r) => String(r.id) },
    { header: "Client", value: (r) => r.clientName },
    { header: "Mobile", value: (r) => r.mobile },
    { header: "Service", value: (r) => r.serviceCategory?.name ?? "" },
    { header: "PAN Number", value: (r) => r.panNumber ?? "" },
    { header: "Aadhaar (last 4)", value: (r) => r.aadhaarLast4 ?? "" },
    { header: "Tax Year", value: (r) => r.taxYear ?? "" },
    { header: "Query", value: (r) => r.queryText },
    { header: "Status", value: (r) => r.status },
    { header: "Assigned To", value: (r) => r.assignedTo?.fullName ?? "" },
    { header: "Created", value: (r) => r.createdAt.toISOString() },
  ];

  if (format === "pdf") {
    exportPdf(res, "client-queries", "Client Queries", columns, queries);
  } else {
    await exportXlsx(res, "client-queries", columns, queries);
  }
});
