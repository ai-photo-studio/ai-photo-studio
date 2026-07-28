import { Router } from "express";
import type { AppConfig } from "../config/env";
import { RestorationController } from "../controllers/restoration.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { rateLimit } from "../middleware/rate-limit.middleware";

export const createRestorationRouter = (config: AppConfig): Router => {
  const router = Router();
  const controller = new RestorationController(config);

  router.post("/restorations", rateLimit(60_000, 10), controller.createOrder);
  router.get("/restorations", requireAuth(config), controller.listOrders);
  router.get("/restorations/:id", controller.getOrder);
  router.post("/restorations/:id/items", rateLimit(60_000, 20), controller.addItem);
  router.post("/restorations/:id/items/:itemId/quality-analysis", controller.runQualityAnalysis);
  router.post("/restorations/:id/items/:itemId/preview", controller.generatePreview);
  router.post("/restorations/:id/items/:itemId/approve", controller.approveItem);
  router.post("/restorations/:id/items/:itemId/download", rateLimit(60_000, 30), controller.getDownload);
  router.post("/restorations/:id/items/:itemId/process", rateLimit(60_000, 60), controller.processItem);

  return router;
};
