import { Router } from "express";
import type { AppConfig } from "../config/env";
import { AdminAuthController } from "../controllers/admin-auth.controller";
import { AdminController } from "../controllers/admin.controller";
import type { AdminRole } from "../services/admin-auth.service";
import { requireAdminAuth } from "../middleware/admin-auth.middleware";

export const createAdminRouter = (config: AppConfig): Router => {
  const router = Router();
  const controller = new AdminController(config);
  const authController = new AdminAuthController(config);

  const opsRoles: AdminRole[] = ["SUPER_ADMIN", "OPERATIONS", "SUPPORT"];
  const financeRoles: AdminRole[] = ["SUPER_ADMIN", "FINANCE"];
  const adminRoles: AdminRole[] = ["SUPER_ADMIN"];

  router.post("/admin/auth/login", authController.login);
  router.post("/admin/auth/logout", requireAdminAuth(config), authController.logout);
  router.get("/admin/auth/me", requireAdminAuth(config), authController.me);
  router.post("/admin/auth/refresh", authController.refresh);

  router.get("/admin/dashboard", requireAdminAuth(config, opsRoles), controller.dashboard);
  router.get("/admin/stats", requireAdminAuth(config, adminRoles), controller.stats);
  router.get("/admin/queue-depth", requireAdminAuth(config, opsRoles), controller.queueDepth);
  router.get("/admin/orders", requireAdminAuth(config, opsRoles), controller.orders);
  router.get("/admin/jobs", requireAdminAuth(config, opsRoles), controller.jobs);
  router.get("/admin/orders/:id", requireAdminAuth(config, opsRoles), controller.orderDetail);
  router.get("/admin/failed-jobs", requireAdminAuth(config, opsRoles), controller.failedJobs);
  router.get("/admin/payments", requireAdminAuth(config, financeRoles), controller.payments);
  router.get("/admin/wallets", requireAdminAuth(config, financeRoles), controller.wallets);
  router.get("/admin/subscriptions", requireAdminAuth(config, financeRoles), controller.subscriptions);
  router.get("/admin/customers", requireAdminAuth(config, opsRoles), controller.customers);
  router.get("/admin/packages", requireAdminAuth(config, adminRoles), controller.packages);
  router.get("/admin/customers/:id", requireAdminAuth(config, opsRoles), controller.customerDetail);
  router.patch("/admin/customers/:id/test-mode", requireAdminAuth(config, adminRoles), controller.toggleCustomerTestMode);
  router.get("/admin/creative-jobs", requireAdminAuth(config, opsRoles), controller.creativeJobs);
  router.get("/admin/creative-jobs/:id", requireAdminAuth(config, opsRoles), controller.creativeJobDetail);
  router.get("/admin/processing-metrics", requireAdminAuth(config, opsRoles), controller.processingMetrics);
  router.get("/admin/queue-metrics", requireAdminAuth(config, opsRoles), controller.queueMetrics);
  router.get("/admin/queue-health", requireAdminAuth(config, opsRoles), controller.getQueueHealthStatus);
  router.get("/admin/cost-metrics", requireAdminAuth(config, adminRoles), controller.costMetrics);
  router.get("/admin/creative-cost-metrics", requireAdminAuth(config, adminRoles), controller.creativeCostMetrics);
  router.post("/admin/orders/:id/retry", requireAdminAuth(config, opsRoles), controller.retryOrder);
  router.post("/admin/orders/:id/approve-manual-payment", requireAdminAuth(config, financeRoles), controller.approveManualPayment);
  router.post("/admin/orders/:id/reject-manual-payment", requireAdminAuth(config, financeRoles), controller.rejectManualPayment);
  router.post("/admin/orders/:id/send-again", requireAdminAuth(config, opsRoles), controller.sendAgain);
  router.post("/admin/jobs/:id/retry", requireAdminAuth(config, opsRoles), controller.retryJob);
  router.post("/admin/packages", requireAdminAuth(config, adminRoles), controller.upsertPackage);
  router.post("/admin/payments/:id/approve", requireAdminAuth(config, financeRoles), controller.approvePayment);
  router.post("/admin/payments/:id/reject", requireAdminAuth(config, financeRoles), controller.rejectPayment);

  return router;
};
