import "dotenv/config";
import path from "path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  aadhaarEncryptionKey: required("AADHAAR_ENCRYPTION_KEY"),
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? "uploads"),
  // Comma-separated list of allowed frontend origins, e.g. "https://app.vercel.app,https://staging.vercel.app".
  // Leave unset to allow any origin (dev default).
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
    : undefined,
  // The single canonical login URL to put in emails (password resets, agent alerts, admin backup
  // alerts) — not the same thing as corsOrigins (which can list several allowed origins).
  frontendUrl: (process.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/$/, ""),
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "Office Management <no-reply@officemanagement.local>",
  },
};
