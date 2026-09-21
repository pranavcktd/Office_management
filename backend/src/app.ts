import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { authenticate, requireAdmin, requireModule } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";
import { publicRouter } from "./modules/public/public.routes";
import { reportsRouter } from "./modules/reports/reports.routes";
import { staffRouter } from "./modules/staff/staff.routes";
import { attendanceRouter } from "./modules/attendance/attendance.routes";
import { agentsRouter } from "./modules/agents/agents.routes";
import { panRouter } from "./modules/pan/pan.routes";
import { tanRouter } from "./modules/tan/tan.routes";
import { dispatchRouter } from "./modules/dispatch/dispatch.routes";
import { queriesRouter } from "./modules/queries/queries.routes";
import { settingsRouter } from "./modules/settings/settings.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { agentPortalRouter } from "./modules/agent-portal/agent-portal.routes";
import { masterRouter } from "./modules/master/master.routes";
import { auditRouter } from "./modules/audit/audit.routes";
import { dayEndReportRouter } from "./modules/day-end-report/day-end-report.routes";
import { documentsRouter } from "./modules/documents/documents.routes";
import { backupRouter } from "./modules/backup/backup.routes";
import { staffLedgerRouter } from "./modules/staff-ledger/staff-ledger.routes";
import { trackingLinksRouter } from "./modules/tracking-links/tracking-links.routes";

export const app = express();

app.use(cors({ origin: env.corsOrigins ?? true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/public", publicRouter);

// Everything below requires a valid JWT; per-route role checks are in each router, and
// module-gated routes additionally check the staff member's granted modules (ADMIN bypasses).
app.use("/api/staff", authenticate, staffRouter);
// Not module-gated like the routers below — every staff member punches their own attendance
// regardless of which business-function modules they're granted, so access is universal here
// (each route inside attendanceRouter still has its own role check: requireStaff for punching,
// requireReadAccess for viewing, requireAdmin for admin marks/overrides).
app.use("/api/attendance", authenticate, attendanceRouter);
app.use("/api/agents", authenticate, requireModule("agents"), agentsRouter);
app.use("/api/pan", authenticate, requireModule("pan"), panRouter);
app.use("/api/tan", authenticate, requireModule("tan"), tanRouter);
app.use("/api/dispatch", authenticate, requireModule("dispatch"), dispatchRouter);
app.use("/api/queries", queriesRouter);
app.use("/api/settings", authenticate, settingsRouter);
app.use("/api/dashboard", authenticate, dashboardRouter);
app.use("/api/agent-portal", agentPortalRouter);
app.use("/api/master", authenticate, masterRouter);
app.use("/api/audit", authenticate, auditRouter);
app.use("/api/day-end-report", authenticate, dayEndReportRouter);
app.use("/api/documents", authenticate, documentsRouter);
app.use("/api/reports", authenticate, reportsRouter);
app.use("/api/backup", authenticate, requireAdmin, backupRouter);
// Not module-gated — same reasoning as attendance: every staff member can always see their own
// credit/debit ledger, only admin can add/edit/delete entries (enforced per-route inside).
app.use("/api/staff-ledger", authenticate, staffLedgerRouter);
// Open to any authenticated principal (staff of any role, or an agent) — the "Track
// Application"/"Track" buttons need to work for whoever is looking at a PAN/TAN/Dispatch entry;
// only creating/editing/deleting a link is admin-only (enforced per-route inside).
app.use("/api/tracking-links", authenticate, trackingLinksRouter);

app.use(errorHandler);
