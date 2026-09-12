import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { env } from "../config/env";

const DOCUMENT_DIR = path.join(env.uploadDir, "documents");
fs.mkdirSync(DOCUMENT_DIR, { recursive: true });

const ALLOWED = /\.(pdf|docx?|xlsx?|pptx?|jpg|jpeg|png|zip)$/i;

export const uploadDocument = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DOCUMENT_DIR),
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || ".bin").toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.test(file.originalname)) {
      cb(new Error("Unsupported file type — use PDF, Word, Excel, PowerPoint, an image, or a zip"));
      return;
    }
    cb(null, true);
  },
});

export function documentAbsolutePath(relative: string): string {
  // relative is stored as "documents/<uuid>.<ext>"; never let it escape the upload dir.
  const resolved = path.resolve(env.uploadDir, relative);
  if (!resolved.startsWith(env.uploadDir)) throw new Error("Invalid document path");
  return resolved;
}
