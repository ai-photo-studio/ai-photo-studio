import { Router } from "express";
import type { AppConfig } from "../config/env";
import { PreviewController } from "../controllers/preview.controller";

export const createPreviewRouter = (config: AppConfig): Router => {
  const router = Router();
  const controller = new PreviewController(config);

  router.post("/previews/web", controller.claimWebPreview);
  router.post("/previews/background-removal", controller.removeBackgroundPreview);

  return router;
};
