import { Router } from "express";
import type { AppConfig } from "../config/env";
import { RestorationController } from "../controllers/restoration.controller";
import { RestorationCustomerController } from "../controllers/restoration-customer.controller";
import { FixedOrderController } from "../controllers/fixed-order.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { actorFromRequest } from "../utils/ownership";
import { rateLimit } from "../middleware/rate-limit.middleware";
import { CustomerCheckoutController } from "../controllers/customer-checkout.controller";
import { FixedOrderRestorationStatusController } from "../controllers/fixed-order-restoration-status.controller";
// R9.5-P4B7-TEST-CHECKOUT-SEAM: importing this module has no side effects on
// its own -- `CustomerCheckoutTestController`/`CustomerCheckoutTestService`
// only ever throw from inside their constructors, and construction happens
// below strictly behind `testCheckoutSeamAllowed()`, so this import is safe
// even in a production process (the class is simply never instantiated).
import { CustomerCheckoutTestController } from "../controllers/customer-checkout-test.controller";
import { PrintFulfilmentBoundaryService } from "../services/print-fulfilment-boundary.service";
import { PUBLIC_MEMORY_PACKAGES } from "../domain/pricing/memoryPackages";

/**
 * R9.5-P4B7-TEST-CHECKOUT-SEAM: true only for a disposable local E2E harness
 * process -- never in production, and never without the explicit opt-in this
 * repo already uses everywhere else for zero-cost test mode. Mirrors the
 * mock P4B worker runner's own guard (`p4b-worker-runner-mock-local.ts`).
 */
const testCheckoutSeamAllowed = (): boolean =>
  process.env.PRELAUNCH_MOCK_MODE === "true" ||
  (process.env.NODE_ENV !== "production" && process.env.COMMERCE_E2E_TEST_MODE === "true");

export const createRestorationRouter = (config: AppConfig): Router => {
  const router = Router();
  const controller = new RestorationController(config);
  const customerController = new RestorationCustomerController(config);
  const fixedOrderController = new FixedOrderController();
  const checkoutController = new CustomerCheckoutController(config);
  const restorationStatusController = new FixedOrderRestorationStatusController(config);
  const printFulfilment = new PrintFulfilmentBoundaryService();

  router.post("/restorations", rateLimit(60_000, 10), controller.createOrder);
  router.get("/restorations", requireAuth(config), controller.listOrders);
  router.get("/restorations/:id", controller.getOrder);
  router.post("/restorations/:id/items", rateLimit(60_000, 20), controller.addItem);
  router.post("/restorations/:id/items/:itemId/quality-analysis", controller.runQualityAnalysis);
  router.post("/restorations/:id/items/:itemId/preview", controller.generatePreview);
  router.post("/restorations/:id/items/:itemId/approve", controller.approveItem);
  router.post("/restorations/:id/items/:itemId/download", rateLimit(60_000, 30), controller.getDownload);
  router.get("/restorations/:id/items/:itemId/download", rateLimit(60_000, 30), controller.getDownload);
  router.get("/customer/restorations/:id", rateLimit(60_000, 30), customerController.getStatus);
  router.get("/customer/restorations/:id/download/:itemId", rateLimit(60_000, 30), customerController.getDownload);
  router.post(
    "/fixed-orders/restoration-digital",
    rateLimit(60_000, 20),
    fixedOrderController.createRestorationDigitalOrder
  );
  router.post(
    "/fixed-orders/restoration-cart",
    rateLimit(60_000, 20),
    fixedOrderController.createRestorationCartOrder
  );
  router.post("/fixed-orders/memory-package", rateLimit(60_000, 20), fixedOrderController.createMemoryPackageOrder);
  router.get("/print-catalog", rateLimit(60_000, 60), fixedOrderController.getPrintCatalog);
  router.get("/memory-packages", rateLimit(60_000, 60), (_req, res) => res.json({ success: true, data: PUBLIC_MEMORY_PACKAGES }));
  router.get("/fixed-orders/:orderNo", rateLimit(60_000, 60), fixedOrderController.getByOrderNo);
  router.get("/fixed-orders/:orderNo/cart", rateLimit(60_000, 60), fixedOrderController.getCartByOrderNo);
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
  router.get("/fixed-orders/:orderNo/restoration-status", rateLimit(60_000, 60), restorationStatusController.getStatus);
  router.get("/fixed-orders/:orderNo/restoration-status/all", rateLimit(60_000, 60), restorationStatusController.getAllItemsStatus);
  router.post("/fixed-orders/:orderNo/print-fulfilment", rateLimit(60_000, 20), async (req, res) => {
    try { res.status(200).json({ success: true, data: await printFulfilment.prepare(req.params.orderNo, actorFromRequest(req)) }); }
    catch (error) { const appError = error as { statusCode?: number; code?: string; message?: string }; res.status(appError.statusCode || 500).json({ success: false, code: appError.code || "INTERNAL_ERROR", message: appError.message || "Unable to prepare print fulfilment" }); }
  });
  // R9.5-P5Q: multi-item cart equivalent -- prepares every print-eligible
  // item on the order, skips digital-only items entirely.
  router.post("/fixed-orders/:orderNo/print-fulfilment/all", rateLimit(60_000, 20), async (req, res) => {
    try { res.status(200).json({ success: true, data: await printFulfilment.prepareAllPrintItems(req.params.orderNo, actorFromRequest(req)) }); }
    catch (error) { const appError = error as { statusCode?: number; code?: string; message?: string }; res.status(appError.statusCode || 500).json({ success: false, code: appError.code || "INTERNAL_ERROR", message: appError.message || "Unable to prepare print fulfilment" }); }
  });

  // R9.5-P4B7-TEST-CHECKOUT-SEAM: only ever registered in a disposable local
  // E2E process. Not present in the route table at all (not just refused at
  // runtime) unless both guards hold at server startup -- see
  // `customer-checkout-test.service.ts` for the full trust-boundary note.
  if (testCheckoutSeamAllowed()) {
    const testCheckoutController = new CustomerCheckoutTestController();
    router.post("/fixed-orders/:orderNo/test-checkout", rateLimit(60_000, 20), testCheckoutController.create);
    router.post("/fixed-orders/:orderNo/test-checkout/complete", rateLimit(60_000, 20), testCheckoutController.complete);
    // R9.5-P4B7B: server-authoritative test-mode signal for the browser --
    // the customer UI must never infer "test mode" from its own build-time
    // Vite env (a client value carries no authority over payment). This
    // route's mere presence (200) is the only signal the Review page trusts;
    // its absence (404, identical to production) means "do not show the
    // test-payment button." No request body, no state, nothing to guard
    // beyond the same route-mount guard already gating the seam above.
    router.get("/e2e/test-mode", rateLimit(60_000, 60), (_req, res) => {
      res.json({ success: true, data: { enabled: true } });
    });
  }

  return router;
};
