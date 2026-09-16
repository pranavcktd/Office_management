import { Router } from "express";
import { requireAdmin } from "../../middleware/auth";
import { createTrackingLink, deleteTrackingLink, listTrackingLinks, updateTrackingLink } from "./tracking-links.controller";

export const trackingLinksRouter = Router();

// Read is open to any authenticated principal — staff, auditor, or agent — since this is what
// drives the "Track Application"/"Track" buttons on PAN/TAN/Dispatch for everyone who uses them.
trackingLinksRouter.get("/:module", listTrackingLinks);
trackingLinksRouter.post("/:module", requireAdmin, createTrackingLink);
trackingLinksRouter.patch("/:id", requireAdmin, updateTrackingLink);
trackingLinksRouter.delete("/:id", requireAdmin, deleteTrackingLink);
