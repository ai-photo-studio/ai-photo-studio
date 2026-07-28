import { Router } from "express";
import type { AppConfig } from "../config/env";
import { CustomerController } from "../controllers/customer.controller";
import { requireAuth } from "../middleware/auth.middleware";

export const createCustomerRouter = (config: AppConfig): Router => {
  const router = Router();
  const controller = new CustomerController(config);

  router.get("/me/wallet", requireAuth(config), controller.wallet);
  router.get("/me/payments", requireAuth(config), controller.payments);
  router.get("/me/subscription", requireAuth(config), controller.subscription);

  return router;
};
