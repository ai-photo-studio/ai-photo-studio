import type { NextFunction, Request, Response } from "express";

const store = new Map<string, { count: number; resetAt: number }>();

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 60_000);

process.on("SIGTERM", () => clearInterval(cleanupInterval));
process.on("SIGINT", () => clearInterval(cleanupInterval));

export const rateLimit = (windowMs: number, maxRequests: number) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    let entry = store.get(key);

    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    res.setHeader("X-RateLimit-Limit", String(maxRequests));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, maxRequests - entry.count)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > maxRequests) {
      res.status(429).json({
        success: false,
        code: "RATE_LIMITED",
        message: "Too many requests, please try again later"
      });
      return;
    }

    next();
  };
};
