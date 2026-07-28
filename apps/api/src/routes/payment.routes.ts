import { Router } from "express";
import type { AppConfig } from "../config/env";
import { PaymentController } from "../controllers/payment.controller";

export const createPaymentRouter = (config: AppConfig): Router => {
  const router = Router();
  const controller = new PaymentController(config);

  router.post("/payments/create-checkout", controller.createCheckout);
  router.post("/payments/manual-proof", controller.submitManualProof);
  router.post("/webhooks/payment", controller.webhook);
  router.get("/payments/:orderNo/status", controller.getStatus);

  return router;
};
