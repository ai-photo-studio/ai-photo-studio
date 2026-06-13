import { Router } from "express";
import type { AppConfig } from "../config/env";
import { MonitoringController } from "../controllers/monitoring.controller";

export const createMonitoringRouter = (config: AppConfig): Router => {
  const router = Router();
  const controller = new MonitoringController(config);

  router.get("/monitoring/health", controller.health);
  router.get("/monitoring/queue", controller.queue);
  router.get("/monitoring/worker", controller.worker);
  router.get("/monitoring/services", controller.services);

  return router;
};
