import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { env } from "../config/env";

const RECEIPT_DIR = path.join(env.uploadDir, "receipts");
fs.mkdirSync(RECEIPT_DIR, { recursive: true });

const ALLOWED = /\.(pdf|jpg|jpeg|png|webp)$/i;

export const uploadReceipt = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, RECEIPT_DIR),
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || ".bin").toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.test(file.originalname)) {
      cb(new Error("Receipt must be a PDF or image (jpg/png/webp)"));
      return;
    }
    cb(null, true);
  },
});

export function receiptAbsolutePath(relative: string): string {
  // relative is stored as "receipts/<uuid>.<ext>"; never let it escape the upload dir.
  const resolved = path.resolve(env.uploadDir, relative);
  if (!resolved.startsWith(env.uploadDir)) throw new Error("Invalid receipt path");
  return resolved;
}
