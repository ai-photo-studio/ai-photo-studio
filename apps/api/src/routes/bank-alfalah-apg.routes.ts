// R9.2-MERGE-P148-P149-AND-APG-URL-FOUNDATION
//
// Exact public routes for the Bank Alfalah local APG URL foundation:
//   GET  /api/payments/bank-alfalah/return
//   POST /api/payments/bank-alfalah/ipn
//
// See apps/api/src/controllers/bank-alfalah-apg.controller.ts for the
// fail-closed behavior contract.
import { Router } from "express";
import type { AppConfig } from "../config/env";
import { BankAlfalahApgController } from "../controllers/bank-alfalah-apg.controller";
import { rateLimit } from "../middleware/rate-limit.middleware";

export const createBankAlfalahApgRouter = (config: AppConfig): Router => {
  const router = Router();
  const controller = new BankAlfalahApgController(config);

  router.get("/payments/bank-alfalah/return", rateLimit(60_000, 60), controller.return);
  router.post("/payments/bank-alfalah/ipn", rateLimit(60_000, 30), controller.ipn);

  return router;
};
