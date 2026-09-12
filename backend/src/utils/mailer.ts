import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { env } from "../config/env";
import { prisma } from "../db/prisma";

interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}

interface ResolvedSmtp {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

// DB config (Settings screen) wins over .env; .env is the fallback for first boot.
async function resolveSmtp(): Promise<ResolvedSmtp | null> {
  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } }).catch(() => null);
  const host = cfg?.smtpHost || env.smtp.host;
  if (!host) return null;
  return {
    host,
    port: cfg?.smtpPort ?? env.smtp.port,
    secure: cfg?.smtpSecure ?? env.smtp.secure,
    user: cfg?.smtpUser || env.smtp.user,
    pass: cfg?.smtpPass || env.smtp.pass,
    from: cfg?.smtpFrom || env.smtp.from,
  };
}

function buildTransport(s: ResolvedSmtp): Transporter {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: s.user ? { user: s.user, pass: s.pass } : undefined,
  });
}

/**
 * Fire-and-forget email send. Never throws — a misconfigured or unreachable SMTP
 * server must not block login or any other request; it just logs and no-ops.
 */
export async function sendMail(opts: MailOptions): Promise<void> {
  const s = await resolveSmtp();
  if (!s) {
    console.warn(`[mailer] SMTP not configured — skipping "${opts.subject}" to ${opts.to}`);
    return;
  }
  try {
    await buildTransport(s).sendMail({ from: s.from, ...opts });
  } catch (err) {
    console.error(`[mailer] Failed to send "${opts.subject}" to ${opts.to}:`, err);
  }
}

/** Used by the Settings "send test email" button — surfaces the real error instead of swallowing it. */
export async function sendMailStrict(opts: MailOptions): Promise<void> {
  const s = await resolveSmtp();
  if (!s) throw new Error("SMTP is not configured — set it in Settings → Email first.");
  await buildTransport(s).sendMail({ from: s.from, ...opts });
}
