import { z } from "zod";

/** A plain 10-digit Indian mobile number — numeric only, no country code or separators. */
export const mobileSchema = z
  .string()
  .regex(/^\d{10}$/, "mobile must be a 10-digit number");
