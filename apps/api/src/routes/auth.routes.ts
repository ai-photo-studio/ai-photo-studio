import { Router } from "express";
import type { AppConfig } from "../config/env";
import { AuthController } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth.middleware";

export const createAuthRouter = (config: AppConfig): Router => {
  const router = Router();
  const controller = new AuthController(config);

  router.post("/auth/register", controller.register);
  router.post("/auth/login", controller.login);
  router.post("/auth/refresh", controller.refresh);
  router.get("/auth/me", requireAuth(config), controller.me);

  return router;
};
