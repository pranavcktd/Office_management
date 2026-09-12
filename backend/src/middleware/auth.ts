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

  req.user = payload;
  next();
});

/** Requires the current STAFF principal to have the given module granted (ADMIN passes always). */
export function requireModule(moduleKey: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new ApiError(401, "Not authenticated"));
    if (req.user.role === "ADMIN") return next();
    if (req.user.role !== "STAFF" || !req.user.modules?.includes(moduleKey)) {
      return next(new ApiError(403, `You don't have access to the ${moduleKey} module`));
    }
    next();
  };
}

/**
 * Restricts a route to the given principal roles. Pass "ADMIN", "STAFF", or "AGENT".
 */
export function requireRole(...roles: Array<"ADMIN" | "STAFF" | "AGENT">) {
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

/** Shorthand: staff endpoints (Admin or Staff), excluding the external agent portal. */
export const requireStaff = requireRole("ADMIN", "STAFF");
export const requireAdmin = requireRole("ADMIN");
