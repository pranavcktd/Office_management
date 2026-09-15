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
