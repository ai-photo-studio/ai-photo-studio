import { Router } from "express";
import type { AppConfig } from "../config/env";
import { CreativeController } from "../controllers/creative.controller";
import { requireAuth } from "../middleware/auth.middleware";

export const createCreativeRouter = (config: AppConfig): Router => {
  const router = Router();
  const controller = new CreativeController(config);

  router.post("/creative/flat-lay", requireAuth(config), controller.createFlatLay);
  router.post("/creative/lifestyle", requireAuth(config), controller.createLifestyleScene);
  router.post("/creative/virtual-model", requireAuth(config), controller.createVirtualModel);
  router.post("/creative/video-prep", requireAuth(config), controller.createVideoPrep);

  return router;
};