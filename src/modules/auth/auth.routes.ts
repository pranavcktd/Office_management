import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import { agentLogin, changePassword, forgotPassword, getMe, logout, staffLogin, updateProfile } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/staff/login", staffLogin);
authRouter.post("/agent/login", agentLogin);
authRouter.post("/forgot-password", forgotPassword);
authRouter.get("/me", authenticate, getMe);
authRouter.patch("/profile", authenticate, updateProfile);
authRouter.post("/change-password", authenticate, changePassword);
authRouter.post("/logout", authenticate, logout);
