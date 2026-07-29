import jwt from "jsonwebtoken";
import { timingSafeEqual } from "node:crypto";
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
  const header = String(req.headers.authorization || "");
  if (!header) return "";
  const bearerPrefix = "bearer ";
  if (header.toLowerCase().startsWith(bearerPrefix)) {
    return header.slice(bearerPrefix.length).trim();
  }
  return header.trim();
};

const extractMachineToken = (req: Request): string => String(req.headers["x-admin-token"] || "").trim();

export const matchesMachineToken = (candidate: string, configured: string): boolean => {
  if (!candidate || !configured) return false;
  const candidateBytes = Buffer.from(candidate, "utf8");
  const configuredBytes = Buffer.from(configured, "utf8");
  return candidateBytes.length === configuredBytes.length && timingSafeEqual(candidateBytes, configuredBytes);
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

// Machine authentication is intentionally scoped to the private runtime diagnostic.
// It never grants access to the general admin router.
export const requireRuntimeDiagnosticAuth = (config: AppConfig, allowedRoles: AdminRole[] = []) => {
  const jwtAuth = requireAdminAuth(config, allowedRoles);
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const machineToken = extractMachineToken(req);
    if (machineToken) {
      if (matchesMachineToken(machineToken, process.env.ADMIN_AUTH_TOKEN || "")) {
        next();
        return;
      }
      next(new AppError("Invalid admin token", 401, "INVALID_ADMIN_TOKEN"));
      return;
    }

    await jwtAuth(req, res, next);
  };
};
