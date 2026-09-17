import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { env } from "../../config/env";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { AuthPrincipal } from "../../types/express";
import { parseDurationMs } from "../../utils/duration";
import { sendMail } from "../../utils/mailer";
import { logAudit } from "../../utils/audit";
import { generateRandomPassword } from "../../utils/password";
import { mobileSchema } from "../../utils/validators";

// How long a forgot-password temporary password stays valid before it must be re-requested.
const PENDING_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Checks a login attempt against both the live password and a pending forgot-password reset
 * (if any, and not expired) — the old password keeps working until the emailed temporary one is
 * actually used, at which point this promotes it to the live password and flags a forced change.
 * Returns whether the credential was valid and, if a promotion happened, the fields to persist.
 */
async function verifyPassword(
  passwordHash: string,
  pendingPasswordHash: string | null,
  pendingPasswordExpiresAt: Date | null,
  password: string
): Promise<{ valid: boolean; promote?: { passwordHash: string; mustChangePassword: true } }> {
  if (await bcrypt.compare(password, passwordHash)) {
    return { valid: true };
  }
  if (
    pendingPasswordHash &&
    pendingPasswordExpiresAt &&
    pendingPasswordExpiresAt > new Date() &&
    (await bcrypt.compare(password, pendingPasswordHash))
  ) {
    return { valid: true, promote: { passwordHash: pendingPasswordHash, mustChangePassword: true } };
  }
  return { valid: false };
}

const staffLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const agentLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function issueSession(
  principalKind: "staff" | "agent",
  principalId: number,
  role: AuthPrincipal["role"]
): Promise<string> {
  const ttlMs = parseDurationMs(env.jwtExpiresIn);
  const session = await prisma.session.create({
    data: {
      principalKind,
      principalId,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });

  const payload: AuthPrincipal = { kind: principalKind, id: principalId, role, sessionId: session.id };
  const options: jwt.SignOptions = { expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"] };
  return jwt.sign(payload, env.jwtSecret, options);
}

export const staffLogin = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = staffLoginSchema.parse(req.body);

  const staff = await prisma.staff.findUnique({ where: { email: email.toLowerCase() } });

  if (!staff || !staff.isActive) {
    throw new ApiError(401, "Invalid credentials");
  }
  // Maintenance mode blocks every login except ADMIN — see setMaintenanceMode's comment for why.
  if (staff.role !== "ADMIN") {
    const cfg = await prisma.appConfig.findUnique({ where: { id: 1 }, select: { maintenanceMode: true, maintenanceMessage: true, maintenanceUntil: true } });
    if (cfg?.maintenanceMode) {
      throw new ApiError(503, cfg.maintenanceMessage || "The system is temporarily under maintenance.", {
        maintenance: true,
        until: cfg.maintenanceUntil,
      });
    }
  }
  const result = await verifyPassword(staff.passwordHash, staff.pendingPasswordHash, staff.pendingPasswordExpiresAt, password);
  if (!result.valid) {
    throw new ApiError(401, "Invalid credentials");
  }

  const mustChangePassword = result.promote ? true : staff.mustChangePassword;
  await prisma.staff.update({
    where: { id: staff.id },
    data: {
      lastLoginAt: new Date(),
      ...(result.promote
        ? { passwordHash: result.promote.passwordHash, mustChangePassword: true, pendingPasswordHash: null, pendingPasswordExpiresAt: null }
        : {}),
    },
  });

  const token = await issueSession("staff", staff.id, staff.role);
  void logAudit(null, {
    action: "LOGIN",
    entityType: "staff",
    entityId: staff.id,
    actor: { kind: "staff", id: staff.id, name: staff.fullName },
  });

  res.json({
    token,
    user: {
      id: staff.id,
      fullName: staff.fullName,
      role: staff.role,
      modules: staff.role === "ADMIN" ? null : staff.modules,
      mustChangePassword,
    },
  });
});

export const agentLogin = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = agentLoginSchema.parse(req.body);

  const agent = await prisma.agent.findUnique({ where: { email: email.toLowerCase() } });
  if (!agent || !agent.isActive || !agent.passwordHash) {
    throw new ApiError(401, "Invalid credentials");
  }
  // An agent is never ADMIN, so maintenance mode always blocks agent logins outright.
  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 }, select: { maintenanceMode: true, maintenanceMessage: true, maintenanceUntil: true } });
  if (cfg?.maintenanceMode) {
    throw new ApiError(503, cfg.maintenanceMessage || "The system is temporarily under maintenance.", {
      maintenance: true,
      until: cfg.maintenanceUntil,
    });
  }
  const result = await verifyPassword(agent.passwordHash, agent.pendingPasswordHash, agent.pendingPasswordExpiresAt, password);
  if (!result.valid) {
    throw new ApiError(401, "Invalid credentials");
  }

  const mustChangePassword = result.promote ? true : agent.mustChangePassword;
  await prisma.agent.update({
    where: { id: agent.id },
    data: {
      lastLoginAt: new Date(),
      ...(result.promote
        ? { passwordHash: result.promote.passwordHash, mustChangePassword: true, pendingPasswordHash: null, pendingPasswordExpiresAt: null }
        : {}),
    },
  });

  const token = await issueSession("agent", agent.id, "AGENT");
  void logAudit(null, {
    action: "LOGIN",
    entityType: "agent",
    entityId: agent.id,
    actor: { kind: "agent", id: agent.id, name: agent.agentName },
  });
  res.json({
    token,
    user: {
      id: agent.id,
      agentName: agent.agentName,
      role: "AGENT",
      mustChangePassword,
    },
  });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new ApiError(401, "Not authenticated");
  if (req.user.kind === "agent") {
    const agent = await prisma.agent.findUnique({ where: { id: req.user.id } });
    if (!agent) throw new ApiError(404, "Account not found");
    return res.json({
      id: agent.id,
      agentName: agent.agentName,
      firmName: agent.firmName,
      mobile: agent.mobile,
      email: agent.email,
      address: agent.address,
      role: "AGENT",
      mustChangePassword: agent.mustChangePassword,
      lastLoginAt: agent.lastLoginAt,
    });
  }
  const staff = await prisma.staff.findUnique({ where: { id: req.user.id } });
  if (!staff) throw new ApiError(404, "Account not found");
  res.json({
    id: staff.id,
    fullName: staff.fullName,
    mobile: staff.mobile,
    email: staff.email,
    role: staff.role,
    modules: staff.role === "ADMIN" ? null : staff.modules,
    mustChangePassword: staff.mustChangePassword,
    lastLoginAt: staff.lastLoginAt,
  });
});

// Self-service profile edit — every signed-in user (staff, admin, or agent) can update their own
// contact details, but never their own email: that stays the login identifier an admin controls,
// so it can't be silently changed out from under account lookups (forgot-password, audit trail).
const updateProfileSchema = z.object({
  fullName: z.string().min(1).optional(),
  agentName: z.string().min(1).optional(),
  firmName: z.string().optional(),
  mobile: mobileSchema.optional(),
  address: z.string().optional(),
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new ApiError(401, "Not authenticated");
  const input = updateProfileSchema.parse(req.body);

  if (req.user.kind === "agent") {
    const agent = await prisma.agent.update({
      where: { id: req.user.id },
      data: {
        agentName: input.agentName,
        firmName: input.firmName,
        mobile: input.mobile,
        address: input.address,
      },
    });
    await logAudit(req, { action: "PROFILE_UPDATED", entityType: "agents", entityId: agent.id });
    return res.json({
      id: agent.id,
      agentName: agent.agentName,
      firmName: agent.firmName,
      mobile: agent.mobile,
      email: agent.email,
      address: agent.address,
      role: "AGENT",
      mustChangePassword: agent.mustChangePassword,
      lastLoginAt: agent.lastLoginAt,
    });
  }

  const staff = await prisma.staff.update({
    where: { id: req.user.id },
    data: {
      fullName: input.fullName,
      mobile: input.mobile,
    },
  });
  await logAudit(req, { action: "PROFILE_UPDATED", entityType: "staff", entityId: staff.id });
  res.json({
    id: staff.id,
    fullName: staff.fullName,
    mobile: staff.mobile,
    email: staff.email,
    role: staff.role,
    modules: staff.role === "ADMIN" ? null : staff.modules,
    mustChangePassword: staff.mustChangePassword,
    lastLoginAt: staff.lastLoginAt,
  });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new ApiError(401, "Not authenticated");
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

  if (req.user.kind === "agent") {
    const agent = await prisma.agent.findUnique({ where: { id: req.user.id } });
    if (!agent?.passwordHash || !(await bcrypt.compare(currentPassword, agent.passwordHash))) {
      throw new ApiError(401, "Current password is incorrect");
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.agent.update({ where: { id: agent.id }, data: { passwordHash, mustChangePassword: false } });
    await logAudit(req, { action: "PASSWORD_CHANGED", entityType: "agents", entityId: agent.id });
    return res.json({ ok: true });
  }

  const staff = await prisma.staff.findUnique({ where: { id: req.user.id } });
  if (!staff || !(await bcrypt.compare(currentPassword, staff.passwordHash))) {
    throw new ApiError(401, "Current password is incorrect");
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.staff.update({ where: { id: staff.id }, data: { passwordHash, mustChangePassword: false } });
  await logAudit(req, { action: "PASSWORD_CHANGED", entityType: "staff", entityId: staff.id });
  res.json({ ok: true });
});

const forgotPasswordSchema = z.object({ email: z.string().email() });

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  const lower = email.toLowerCase();

  const staff = await prisma.staff.findUnique({ where: { email: lower } });
  const agent = staff ? null : await prisma.agent.findFirst({ where: { email: { equals: lower, mode: "insensitive" } } });

  if (staff?.isActive) {
    const randomPassword = generateRandomPassword();
    const pendingPasswordHash = await bcrypt.hash(randomPassword, 10);
    const pendingPasswordExpiresAt = new Date(Date.now() + PENDING_PASSWORD_TTL_MS);
    // The current password is left untouched — it keeps working until this temporary one is
    // actually used to sign in, at which point login promotes it and forces a real change.
    await prisma.staff.update({ where: { id: staff.id }, data: { pendingPasswordHash, pendingPasswordExpiresAt } });
    await logAudit(null, {
      action: "PASSWORD_RESET_SELF_SERVICE",
      entityType: "staff",
      entityId: staff.id,
      actor: { kind: "staff", id: staff.id, name: staff.fullName },
    });
    void sendMail({
      to: staff.email!,
      subject: "Your password has been reset — Office Management Portal",
      text: `Your new temporary password is: ${randomPassword}\n\nYour existing password still works until you sign in with this one — once you do, you'll be asked to choose a new password right away. This temporary password expires in 24 hours. If you didn't request this, no action is needed — your old password remains unaffected, but contact your office admin if you're concerned.`,
    });
  } else if (agent?.isActive) {
    const randomPassword = generateRandomPassword();
    const pendingPasswordHash = await bcrypt.hash(randomPassword, 10);
    const pendingPasswordExpiresAt = new Date(Date.now() + PENDING_PASSWORD_TTL_MS);
    await prisma.agent.update({ where: { id: agent.id }, data: { pendingPasswordHash, pendingPasswordExpiresAt } });
    await logAudit(null, {
      action: "PASSWORD_RESET_SELF_SERVICE",
      entityType: "agents",
      entityId: agent.id,
      actor: { kind: "agent", id: agent.id, name: agent.agentName },
    });
    void sendMail({
      to: agent.email!,
      subject: "Your password has been reset — Office Management Portal",
      text: `Your new temporary password is: ${randomPassword}\n\nYour existing password still works until you sign in with this one — once you do, you'll be asked to choose a new password right away. This temporary password expires in 24 hours. If you didn't request this, no action is needed — your old password remains unaffected, but contact your office admin if you're concerned.`,
    });
  }

  // Always respond the same way whether or not the email matched an account, so this
  // endpoint can't be used to enumerate registered emails.
  res.json({ ok: true, message: "If that email is on file, a new password has been sent to it." });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  if (req.user) {
    await prisma.session.update({
      where: { id: req.user.sessionId },
      data: { revokedAt: new Date() },
    });
  }
  res.status(204).send();
});
