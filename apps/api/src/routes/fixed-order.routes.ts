import { Router } from "express";
import type { AppConfig } from "../config/env";
import { FixedOrderController } from "../controllers/fixed-order.controller";
import { optionalAuth, requireAuth } from "../middleware/auth.middleware";
import { rateLimit } from "../middleware/rate-limit.middleware";

export const createFixedOrderRouter = (config: AppConfig): Router => {
  const router = Router();
  const controller = new FixedOrderController();

  router.post(
    "/fixed-orders/restoration-digital",
    optionalAuth(config),
    rateLimit(60_000, 10),
    controller.createRestorationDigitalOrder
  );
  // R9.2-P2R-CUSTOMER-ORDERS: registered before the "/:orderNo" detail route
  // so the literal "/fixed-orders" list path is never captured as an
  // orderNo param. Protected by requireAuth (not optionalAuth) -- this
  // endpoint has no guest mode, unlike the detail route below.
  router.get("/fixed-orders", requireAuth(config), controller.listMyOrders);
  router.get("/fixed-orders/:orderNo", optionalAuth(config), controller.getOrder);

  return router;
};
