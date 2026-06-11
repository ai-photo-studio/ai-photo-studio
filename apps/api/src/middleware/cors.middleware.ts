import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "../config/env";

export const createCorsMiddleware = (config: AppConfig) => {
  const allowedOrigins = config.ALLOWED_ORIGINS
    ? config.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.length > 0) {
      if (allowedOrigins.includes("*")) {
        res.setHeader("Access-Control-Allow-Origin", "*");
      } else if (allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
      }
    } else if (allowedOrigins.length === 0) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }

    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-admin-token");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  };
};
