import { Router } from "express";
import type { AppConfig } from "../config/env";
import { WhatsAppController } from "../controllers/whatsapp.controller";

export const createWhatsAppRouter = (config: AppConfig): Router => {
  const router = Router();
  const controller = new WhatsAppController(config);

  router.get("/webhooks/whatsapp", controller.verifyWebhook);
  router.post("/webhooks/whatsapp", controller.receiveWebhook);

  return router;
};
