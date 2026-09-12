import { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { ZodError } from "zod";
import { ApiError } from "../utils/asyncHandler";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      details: err.flatten(),
    });
  }

  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: err.message,
      details: err.details,
    });
  }

  if (err instanceof MulterError || (err instanceof Error && /only \.xlsx or \.csv/i.test(err.message))) {
    return res.status(400).json({ error: err.message });
  }

  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}
