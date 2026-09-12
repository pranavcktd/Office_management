import crypto from "crypto";

/** Default first-use / admin-reset password — the user must change it on next login. */
export const DEFAULT_PASSWORD = "Client@123";

const RANDOM_PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** A random password for self-service "forgot password" resets, emailed to the user. */
export function generateRandomPassword(length = 10): string {
  let out = "";
  for (const byte of crypto.randomBytes(length)) {
    out += RANDOM_PASSWORD_CHARS[byte % RANDOM_PASSWORD_CHARS.length];
  }
  return out;
}
