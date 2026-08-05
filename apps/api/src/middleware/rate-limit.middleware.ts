import type { NextFunction, Request, Response } from "express";

// R9.2-MPGS-ACTUAL-APP-E2E: confirmed defect fix. `store` was previously
// declared once at module scope, so EVERY call to rateLimit(windowMs, max)
// across the whole app -- the global app.use(rateLimit(60_000, 120)) in
// index.ts included -- shared the exact same Map keyed only by req.ip. Every
// request from a given IP, to ANY rate-limited route, incremented the same
// counter, so a route configured for e.g. 10 requests/60s (POST
// /restoration-drafts) could be exhausted by unrelated GET requests from the
// same IP well before that IP had actually made 10 requests to that route.
// Found via the actual-app dry-run harness: a handful of real page
// navigations plus one draft-creation POST was enough to trigger "Too many
// requests" on the very first checkout attempt. Each rateLimit(...) call now
// gets its OWN private store; a single shared registry + cleanup interval
// avoids creating one interval/process listener per call site.
const allStores: Array<Map<string, { count: number; resetAt: number }>> = [];

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const store of allStores) {
    for (const [key, entry] of store) {
      if (entry.resetAt < now) {
        store.delete(key);
      }
    }
  }
}, 60_000);
// Never keep the process alive solely for this housekeeping timer.
cleanupInterval.unref?.();

process.on("SIGTERM", () => clearInterval(cleanupInterval));
process.on("SIGINT", () => clearInterval(cleanupInterval));

export const rateLimit = (windowMs: number, maxRequests: number) => {
  const store = new Map<string, { count: number; resetAt: number }>();
  allStores.push(store);

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
