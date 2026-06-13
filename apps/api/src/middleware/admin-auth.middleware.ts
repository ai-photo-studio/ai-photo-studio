import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
import { AdminAuthService, normalizeAdminRole, type AdminJwtPayload, type AdminRole } from "../services/admin-auth.service";

declare global {
  namespace Express {
    interface Request {
      admin?: AdminJwtPayload;
    }
  }
}

const extractToken = (req: Request): string => {
  const header = String(req.headers.authorization || req.headers["x-admin-token"] || "");
  if (!header) return "";
  const bearerPrefix = "bearer ";
  if (header.toLowerCase().startsWith(bearerPrefix)) {
    return header.slice(bearerPrefix.length).trim();
  }
  return header.trim();
};

export const verifyAdminToken = (config: AppConfig, token: string): AdminJwtPayload => {
  try {
    return jwt.verify(token, config.ADMIN_JWT_SECRET) as AdminJwtPayload;
  } catch {
    throw new AppError("Invalid or expired admin token", 401, "INVALID_ADMIN_TOKEN");
  }
};

export const requireAdminAuth = (config: AppConfig, allowedRoles: AdminRole[] = []) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractToken(req);
      if (!token) {
        next(new AppError("Admin authentication required", 401, "UNAUTHORIZED"));
        return;
      }
      const payload = verifyAdminToken(config, token);
      req.admin = payload;

      if (allowedRoles.length > 0 && !allowedRoles.includes(normalizeAdminRole(payload.role))) {
        next(new AppError("Forbidden", 403, "FORBIDDEN"));
        return;
      }

      const sessionService = new AdminAuthService(config);
      const session = await sessionService.findSessionById(payload.sid).catch(() => null);
      if (!session || session.adminUserId !== payload.sub) {
        next(new AppError("Invalid or expired admin session", 401, "INVALID_ADMIN_SESSION"));
        return;
      }

      next();
    } catch (error) {
      next(error instanceof AppError ? error : new AppError("Invalid admin token", 401, "INVALID_ADMIN_TOKEN"));
    }
  };
};
