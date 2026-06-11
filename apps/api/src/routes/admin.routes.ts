import { Router } from "express";
import type { AppConfig } from "../config/env";
import { AdminController } from "../controllers/admin.controller";
import { requireAdminAuth } from "../middleware/admin-auth.middleware";

export const createAdminRouter = (config: AppConfig): Router => {
  const router = Router();
  const controller = new AdminController(config);

  router.get("/admin/dashboard", controller.dashboard);
  router.get("/admin/stats", controller.stats);
  router.get("/admin/orders", controller.orders);
  router.get("/admin/jobs", controller.jobs);
  router.get("/admin/orders/:id", controller.orderDetail);
  router.get("/admin/failed-jobs", controller.failedJobs);
  router.get("/admin/payments", requireAdminAuth(config), controller.payments);
  router.get("/admin/wallets", requireAdminAuth(config), controller.wallets);
  router.get("/admin/subscriptions", requireAdminAuth(config), controller.subscriptions);
  router.get("/admin/packages", requireAdminAuth(config), controller.packages);
  router.post("/admin/orders/:id/retry", controller.retryOrder);
  router.post("/admin/orders/:id/approve-manual-payment", requireAdminAuth(config), controller.approveManualPayment);
  router.post("/admin/orders/:id/reject-manual-payment", requireAdminAuth(config), controller.rejectManualPayment);
  router.post("/admin/orders/:id/send-again", controller.sendAgain);
  router.post("/admin/jobs/:id/retry", controller.retryJob);
  router.post("/admin/packages", requireAdminAuth(config), controller.upsertPackage);
  router.post("/admin/payments/:id/approve", requireAdminAuth(config), controller.approvePayment);
  router.post("/admin/payments/:id/reject", requireAdminAuth(config), controller.rejectPayment);

  return router;
};
