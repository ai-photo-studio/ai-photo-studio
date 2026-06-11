import { Router } from "express";
import type { AppConfig } from "../config/env";
import { PackageController } from "../controllers/package.controller";

export const createPackageRouter = (_config: AppConfig): Router => {
  const router = Router();
  const controller = new PackageController();

  router.get("/packages", controller.listPackages);

  return router;
};
