import { Router } from "express";
import { prisma } from "../../db/prisma";
import { asyncHandler } from "../../utils/asyncHandler";

export const publicRouter = Router();

// Unauthenticated on purpose — needs to render on the login screen before anyone signs in, so
// a locked-out staff member or agent always has a way to reach the office admin. Also carries
// the admin-editable header/footer/login notices, so the shell can show them pre-auth too.
publicRouter.get(
  "/system-contact",
  asyncHandler(async (_req, res) => {
    const [admins, cfg] = await Promise.all([
      prisma.staff.findMany({
        where: { role: "ADMIN", isActive: true },
        orderBy: { id: "asc" },
        select: { email: true, mobile: true },
      }),
      prisma.appConfig.findUnique({ where: { id: 1 } }),
    ]);
    const admin = admins[0];
    res.json({
      email: admin?.email ?? null,
      mobile: admin?.mobile ?? null,
      headerNotice: cfg?.headerNotice ?? null,
      footerNotice: cfg?.footerNotice ?? null,
      loginNotice: cfg?.loginNotice ?? null,
    });
  })
);
