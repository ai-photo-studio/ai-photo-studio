import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";

export type JwtPayload = {
  sub: string;
  email: string;
};

export const signToken = (config: AppConfig, payload: JwtPayload): string => {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: "7d" });
};

export const signRefreshToken = (config: AppConfig, payload: JwtPayload): string => {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: "30d" });
};

export const verifyToken = (config: AppConfig, token: string): JwtPayload => {
  try {
    return jwt.verify(token, config.JWT_SECRET) as JwtPayload;
  } catch {
    throw new AppError("Invalid or expired token", 401, "INVALID_TOKEN");
  }
};

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const requireAuth = (config: AppConfig) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header || !header.toLowerCase().startsWith("bearer ")) {
      next(new AppError("Authentication required", 401, "UNAUTHORIZED"));
      return;
    }

    const token = header.slice(7).trim();
    try {
      req.user = verifyToken(config, token);
      next();
    } catch (error) {
      next(error instanceof AppError ? error : new AppError("Invalid token", 401, "INVALID_TOKEN"));
    }
  };
};
