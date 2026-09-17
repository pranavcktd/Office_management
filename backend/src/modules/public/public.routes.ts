import { Router } from "express";
import { prisma } from "../../db/prisma";
import { asyncHandler } from "../../utils/asyncHandler";

export const publicRouter = Router();

// Unauthenticated on purpose — needs to render on the login screen before anyone signs in, so
// the admin-editable header/footer/login notices show pre-auth too. No longer carries a fixed
// admin email/mobile line (the admin now puts whatever contact info they want directly into
// footerNotice/loginNotice via Settings → Site Content).
publicRouter.get(
  "/system-contact",
  asyncHandler(async (_req, res) => {
    const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
    res.json({
      headerNotice: cfg?.headerNotice ?? null,
      footerNotice: cfg?.footerNotice ?? null,
      loginNotice: cfg?.loginNotice ?? null,
    });
  })
);

// Unauthenticated on purpose — the login page needs to show the maintenance banner (and a
// non-admin needs to see why their login was refused) before anyone has a token. The actual
// enforcement lives in middleware/auth.ts and auth.controller.ts's login handlers; this just
// lets the frontend show a friendly message ahead of that.
publicRouter.get(
  "/maintenance-status",
  asyncHandler(async (_req, res) => {
    const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
    res.json({
      enabled: cfg?.maintenanceMode ?? false,
      message: cfg?.maintenanceMessage ?? "",
      until: cfg?.maintenanceUntil ?? null,
    });
  })
);
