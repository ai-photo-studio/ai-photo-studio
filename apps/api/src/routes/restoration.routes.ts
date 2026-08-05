import { Router } from "express";
import type { AppConfig } from "../config/env";
import { RestorationController } from "../controllers/restoration.controller";
import { RestorationCustomerController } from "../controllers/restoration-customer.controller";
import { FixedOrderController } from "../controllers/fixed-order.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { rateLimit } from "../middleware/rate-limit.middleware";
import { CustomerCheckoutController } from "../controllers/customer-checkout.controller";

export const createRestorationRouter = (config: AppConfig): Router => {
  const router = Router();
  const controller = new RestorationController(config);
  const customerController = new RestorationCustomerController(config);
  const fixedOrderController = new FixedOrderController();
  const checkoutController = new CustomerCheckoutController(config);

  router.post("/restorations", rateLimit(60_000, 10), controller.createOrder);
  router.get("/restorations", requireAuth(config), controller.listOrders);
  router.get("/restorations/:id", controller.getOrder);
  router.post("/restorations/:id/items", rateLimit(60_000, 20), controller.addItem);
  router.post("/restorations/:id/items/:itemId/quality-analysis", controller.runQualityAnalysis);
  router.post("/restorations/:id/items/:itemId/preview", controller.generatePreview);
  router.post("/restorations/:id/items/:itemId/approve", controller.approveItem);
  router.post("/restorations/:id/items/:itemId/download", rateLimit(60_000, 30), controller.getDownload);
  router.get("/restorations/:id/items/:itemId/download", rateLimit(60_000, 30), controller.getDownload);
  router.post("/restorations/:id/items/:itemId/process", rateLimit(60_000, 60), controller.processItem);
  router.get("/customer/restorations/:id", rateLimit(60_000, 30), customerController.getStatus);
  router.get("/customer/restorations/:id/download/:itemId", rateLimit(60_000, 30), customerController.getDownload);
  router.post(
    "/fixed-orders/restoration-digital",
    rateLimit(60_000, 20),
    fixedOrderController.createRestorationDigitalOrder
  );
  router.get("/fixed-orders/:orderNo", rateLimit(60_000, 60), fixedOrderController.getByOrderNo);
  // R9.2-MPGS-ACTUAL-APP-E2E: these were previously mounted at
  // /orders/:orderNo/checkout and /orders/:orderNo/payment-status, which
  // collided byte-for-byte with the pre-existing legacy
  // OrderController.createOrderCheckout route (order.routes.ts, mounted
  // earlier in index.ts). Express matches the first-registered handler for
  // an identical path, so the legacy (different order model, different
  // PaymentService) handler always won -- this MPGS checkout controller was
  // unreachable via HTTP in the real running app. Confirmed via the actual-
  // app dry-run harness (real click on FixedOrderReviewPage's "Pay
  // securely" always returned "Order not found" from the legacy handler).
  // Moved under the same /fixed-orders/ prefix already used by the read
  // route directly above, eliminating the collision without touching the
  // legacy Order/PaymentService system at all.
  router.post("/fixed-orders/:orderNo/checkout", rateLimit(60_000, 20), checkoutController.create);
  router.get("/fixed-orders/:orderNo/payment-status", rateLimit(60_000, 60), checkoutController.status);

  return router;
};
