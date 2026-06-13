import { Router } from "express";
import type { AppConfig } from "../config/env";
import { AdminAuthController } from "../controllers/admin-auth.controller";

export const createAdminAuthRouter = (config: AppConfig): Router => {
  const router = Router();
  const controller = new AdminAuthController(config);

  router.post("/admin/auth/login", controller.login);
  router.post("/admin/auth/logout", controller.logout);
  router.get("/admin/auth/me", controller.me);
  router.post("/admin/auth/refresh", controller.refresh);

  return router;
};