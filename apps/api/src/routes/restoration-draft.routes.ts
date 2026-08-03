import { Router } from "express";
import type { AppConfig } from "../config/env";
import { RestorationDraftController } from "../controllers/restoration-draft.controller";
import { optionalAuth } from "../middleware/auth.middleware";
import { rateLimit } from "../middleware/rate-limit.middleware";

export const createRestorationDraftRouter = (config: AppConfig): Router => {
  const router = Router();
  const controller = new RestorationDraftController(config);

  // No requireAuth: free upload must stay reachable by guests. optionalAuth
  // recognizes a logged-in customer as the owner when a valid bearer token
  // is present, without rejecting anonymous requests.
  router.post("/restoration-drafts", optionalAuth(config), rateLimit(60_000, 10), controller.createDraft);
  router.get("/restoration-drafts/:id", optionalAuth(config), rateLimit(60_000, 60), controller.getDraft);
  router.get("/restoration-drafts/:id/offers", optionalAuth(config), rateLimit(60_000, 60), controller.getOffers);

  return router;
};
