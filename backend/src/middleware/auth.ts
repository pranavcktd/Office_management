import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { AuthPrincipal } from "../types/express";
import { ApiError, asyncHandler } from "../utils/asyncHandler";

// Every token carries a session id (sid); logout revokes that row so the token stops
// working immediately instead of remaining valid until its natural JWT expiry.
export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new ApiError(401, "Missing or invalid Authorization header");
  }
  const token = header.slice("Bearer ".length);

  let payload: AuthPrincipal;
  try {
    payload = jwt.verify(token, env.jwtSecret) as AuthPrincipal;
  } catch {
    throw new ApiError(401, "Invalid or expired token");
  }

  const session = await prisma.session.findUnique({ where: { id: payload.sessionId } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new ApiError(401, "Session has been signed out or expired");
  }

  // Refresh live module grants for staff so an admin's permission change takes effect
  // without the user re-logging in. Also enforces deactivation mid-session.
  if (payload.kind === "staff") {
    const staff = await prisma.staff.findUnique({
      where: { id: payload.id },
      select: { isActive: true, role: true, modules: true },
    });
    if (!staff || !staff.isActive) {
      throw new ApiError(401, "Your account is no longer active");
    }
    payload.role = staff.role;
    payload.modules = staff.role === "ADMIN" ? undefined : staff.modules;
  }

  // Maintenance mode blocks everyone except ADMIN — enabling it already force-revokes every
  // other session (see settings.controller.ts's setMaintenanceMode), this is the backstop for
  // any request that slips in with a session that predates that revocation, and for the whole
  // window it's on.
  if (payload.role !== "ADMIN") {
    const cfg = await prisma.appConfig.findUnique({ where: { id: 1 }, select: { maintenanceMode: true, maintenanceMessage: true, maintenanceUntil: true } });
    if (cfg?.maintenanceMode) {
      throw new ApiError(503, cfg.maintenanceMessage || "The system is temporarily under maintenance.", {
        maintenance: true,
        until: cfg.maintenanceUntil,
      });
    }
  }

  req.user = payload;
  next();
});

/** Requires the current principal to have the given module granted for READ purposes — ADMIN and
 * AUDITOR always pass (an auditor sees every module without a per-module grant, same as admin);
 * STAFF needs the module explicitly listed. Only ever mount this on GET routes — an auditor must
 * never reach a write route this way. */
export function requireModule(moduleKey: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new ApiError(401, "Not authenticated"));
    if (req.user.role === "ADMIN" || req.user.role === "AUDITOR") return next();
    if (req.user.role !== "STAFF" || !req.user.modules?.includes(moduleKey)) {
      return next(new ApiError(403, `You don't have access to the ${moduleKey} module`));
    }
    next();
  };
}

/**
 * Restricts a route to the given principal roles. Pass "ADMIN", "STAFF", "AUDITOR", or "AGENT".
 */
export function requireRole(...roles: Array<"ADMIN" | "STAFF" | "AUDITOR" | "AGENT">) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(401, "Not authenticated"));
    }
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, "Insufficient permissions for this action"));
    }
    next();
  };
}

/** Shorthand: staff endpoints (Admin or Staff), excluding the external agent portal. Never grant
 * this to AUDITOR — it's used to gate write routes throughout the app. */
export const requireStaff = requireRole("ADMIN", "STAFF");
export const requireAdmin = requireRole("ADMIN");
/** Read-only endpoints: anyone who can see the module's data, including an auditor. Only ever
 * mount this on GET routes. */
export const requireReadAccess = requireRole("ADMIN", "STAFF", "AUDITOR");
