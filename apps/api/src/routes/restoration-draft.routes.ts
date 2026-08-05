import { Router } from "express";
import type { AppConfig } from "../config/env";
import { RestorationDraftController } from "../controllers/restoration-draft.controller";
import { rateLimit } from "../middleware/rate-limit.middleware";

export const createRestorationDraftRouter = (config: AppConfig): Router => {
  const router = Router();
  const controller = new RestorationDraftController(config);

  router.post("/restoration-drafts", rateLimit(60_000, 10), controller.createDraft);
  router.get("/restoration-drafts/:id", rateLimit(60_000, 60), controller.getDraft);
  router.get("/restoration-drafts/:id/offers", rateLimit(60_000, 60), controller.getOffers);

  return router;
};
