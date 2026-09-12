import { StaffRole } from "@prisma/client";

export interface AuthPrincipal {
  kind: "staff" | "agent";
  id: number;
  role: StaffRole | "AGENT";
  sessionId: string;
  /** Live module grants for a STAFF principal (filled in by `authenticate`). ADMIN = all. */
  modules?: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPrincipal;
    }
  }
}

export {};
