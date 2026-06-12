import { Router } from "express";
import type { AppConfig } from "../config/env";
import { OrderController } from "../controllers/order.controller";
import { requireAuth } from "../middleware/auth.middleware";

export const createOrderRouter = (config: AppConfig): Router => {
  const router = Router();
  const controller = new OrderController(config);

  router.post("/orders", controller.createOrder);
  router.get("/orders/:orderNo", controller.getOrder);
  router.post("/orders/:orderNo/images", controller.addOrderImages);
  router.post("/orders/:orderNo/checkout", controller.createOrderCheckout);
  router.post("/orders/:orderNo/web-upload", requireAuth(config), controller.uploadWebImage);

  return router;
};
