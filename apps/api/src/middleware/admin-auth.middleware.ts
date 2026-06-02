import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";

const extractToken = (req: Request): string => {
  const header = String(req.headers.authorization || req.headers["x-admin-token"] || "");
  if (!header) return "";

  const bearerPrefix = "bearer ";
  if (header.toLowerCase().startsWith(bearerPrefix)) {
    return header.slice(bearerPrefix.length).trim();
  }

  return header.trim();
};

export const requireAdminAuth = (config: AppConfig) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = extractToken(req);
    if (!token || token !== config.ADMIN_JWT_SECRET) {
      next(new AppError("Unauthorized", 401, "UNAUTHORIZED"));
      return;
    }

    next();
  };
};
