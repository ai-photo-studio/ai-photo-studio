import { Router } from "express";
import type { AppConfig } from "../config/env";
import { OrderController } from "../controllers/order.controller";

export const createOrderRouter = (config: AppConfig): Router => {
  const router = Router();
  const controller = new OrderController(config);

  router.post("/orders", controller.createOrder);
  router.get("/orders/:orderNo", controller.getOrder);
  router.post("/orders/:orderNo/images", controller.addOrderImages);
  router.post("/orders/:orderNo/checkout", controller.createOrderCheckout);

  return router;
};
