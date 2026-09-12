import crypto from "crypto";
import { env } from "../config/env";

const ALGORITHM = "aes-256-gcm";
const key = Buffer.from(env.aadhaarEncryptionKey, "hex");

if (key.length !== 32) {
  throw new Error(
    "AADHAAR_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex characters"
  );
}

/**
 * Encrypts a 12-digit Aadhaar number for storage. Format: iv:authTag:ciphertext (all hex).
 */
export function encryptAadhaar(aadhaar: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(aadhaar, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptAadhaar(payload: string): string {
  const [ivHex, authTagHex, ciphertextHex] = payload.split(":");
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// A distinct subkey (not the raw encryption key) used only for the deterministic HMAC below —
// keeps the encryption key and the hashing key cryptographically separate.
const hashKey = crypto.createHmac("sha256", key).update("aadhaar-hash-key").digest();

/**
 * Deterministic HMAC of an Aadhaar number, used to look up existing records by Aadhaar
 * (e.g. matching a TIN-FC acknowledgement report) without ever storing or querying the
 * plaintext number. Same input always produces the same hash, unlike encryptAadhaar().
 */
export function hashAadhaar(aadhaar: string): string {
  return crypto.createHmac("sha256", hashKey).update(aadhaar).digest("hex");
}
