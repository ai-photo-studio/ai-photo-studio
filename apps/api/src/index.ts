import "dotenv/config";
import { execFile as execFileCb } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import express from "express";
import { loadConfig } from "./config/env";
import { createOrderRouter } from "./routes/order.routes";
import { createPreviewRouter } from "./routes/preview.routes";
import { createPaymentRouter } from "./routes/payment.routes";
import { createCustomerRouter } from "./routes/customer.routes";
import { createWhatsAppRouter } from "./routes/whatsapp.routes";
import { createAdminRouter } from "./routes/admin.routes";
import { createAuthRouter } from "./routes/auth.routes";
import { createPackageRouter } from "./routes/package.routes";
import { createMonitoringRouter } from "./routes/monitoring.routes";
import { createAdminAuthRouter } from "./routes/admin-auth.routes";
import { AuthController } from "./controllers/auth.controller";
import { PackageController } from "./controllers/package.controller";
import { MonitoringController } from "./controllers/monitoring.controller";
import { requireAuth } from "./middleware/auth.middleware";
import { createCorsMiddleware } from "./middleware/cors.middleware";
import { rateLimit } from "./middleware/rate-limit.middleware";
import { logger } from "./utils/logger";
import { toErrorMessage } from "./utils/errors";
import { startImageProcessingWorker } from "./workers/image-processing.worker";
import { runCleanupOnce } from "./workers/cleanup.worker";
import { AdminAuthService, normalizeAdminRole } from "./services/admin-auth.service";

const execFile = promisify(execFileCb);

const applyPendingMigrations = async () => {
  const schemaPath = path.join(process.cwd(), "apps", "api", "prisma", "schema.prisma");
  const { stdout, stderr } = await execFile("npx", ["prisma", "migrate", "deploy", "--schema", schemaPath], {
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 10 * 1024 * 1024
  });

  if (stdout) {
    logger.info("Prisma migration output", { output: stdout.trim().slice(0, 1000) });
  }
  if (stderr) {
    logger.warn("Prisma migration warnings", { output: stderr.trim().slice(0, 1000) });
  }
};

const bootstrap = async () => {
  const config = loadConfig();
  const isRailwayProduction =
    process.env.RAILWAY_ENVIRONMENT === "production" ||
    process.env.RAILWAY_ENVIRONMENT_NAME === "production" ||
    config.NODE_ENV === "production";

  if (isRailwayProduction) {
    await applyPendingMigrations();
  }
  const adminAuth = new AdminAuthService(config);
  await adminAuth
    .bootstrapFirstAdmin({
      email: process.env.ADMIN_BOOTSTRAP_EMAIL || "",
      password: process.env.ADMIN_BOOTSTRAP_PASSWORD || "",
      name: process.env.ADMIN_BOOTSTRAP_NAME || "Super Admin",
      role: normalizeAdminRole(process.env.ADMIN_BOOTSTRAP_ROLE || "SUPER_ADMIN")
    })
    .catch((error) => {
      logger.warn("Admin bootstrap skipped", { error: toErrorMessage(error) });
    });
  const app = express();
  const authController = new AuthController(config);
  const packageController = new PackageController();
  const monitoringController = new MonitoringController(config);

  app.use(createCorsMiddleware(config));
  app.use(rateLimit(60_000, 120));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      success: true,
      message: "AI Photo Studio API is running"
    });
  });

  app.get("/api/version", (_req, res) => {
    res.json({
      success: true,
      service: "api",
      version: "0.1.0",
      env: config.NODE_ENV
    });
  });

  app.get("/api/version/routes", (_req, res) => {
    res.json({
      success: true,
      data: {
        routes: [
          { name: "health", path: "/api/health" },
          { name: "version", path: "/api/version" },
          { name: "route-registry", path: "/api/version/routes" },
          { name: "auth-register", path: "/api/auth/register" },
          { name: "auth-login", path: "/api/auth/login" },
          { name: "auth-refresh", path: "/api/auth/refresh" },
          { name: "auth-me", path: "/api/auth/me" },
          { name: "packages", path: "/api/packages" },
          { name: "previews-web", path: "/api/previews/web" },
          { name: "orders-create", path: "/api/orders" },
          { name: "orders-read", path: "/api/orders/:orderNo" },
          { name: "orders-images", path: "/api/orders/:orderNo/images" },
          { name: "orders-checkout", path: "/api/orders/:orderNo/checkout" },
          { name: "orders-web-upload", path: "/api/orders/:orderNo/web-upload" },
          { name: "monitoring-health", path: "/api/monitoring/health" },
          { name: "monitoring-queue", path: "/api/monitoring/queue" },
          { name: "monitoring-worker", path: "/api/monitoring/worker" },
          { name: "admin-dashboard", path: "/api/admin/dashboard" },
          { name: "admin-auth-login", path: "/api/admin/auth/login" },
          { name: "admin-auth-logout", path: "/api/admin/auth/logout" },
          { name: "admin-auth-me", path: "/api/admin/auth/me" },
          { name: "admin-auth-refresh", path: "/api/admin/auth/refresh" },
          { name: "admin-stats", path: "/api/admin/stats" },
          { name: "admin-orders", path: "/api/admin/orders" },
          { name: "admin-jobs", path: "/api/admin/jobs" },
          { name: "admin-order-detail", path: "/api/admin/orders/:id" },
          { name: "admin-customers", path: "/api/admin/customers" }
        ]
      }
    });
  });

  // Direct registrations keep the production route surface explicit even if a router mount changes.
  app.get("/api/auth/me", requireAuth(config), authController.me);
  app.get("/api/packages", packageController.listPackages);
  app.get("/api/monitoring/health", monitoringController.health);
  app.get("/api/monitoring/queue", monitoringController.queue);
  app.get("/api/monitoring/worker", monitoringController.worker);

  app.use("/api", createWhatsAppRouter(config));
  app.use("/api", createPreviewRouter(config));
  app.use("/api", createOrderRouter(config));
  app.use("/api", createPaymentRouter(config));
  app.use("/api", createCustomerRouter(config));
  app.use("/api", createAdminRouter(config));
  app.use("/api", createAdminAuthRouter(config));
  app.use("/api", createAuthRouter(config));
  app.use("/api", createPackageRouter(config));
  app.use("/api", createMonitoringRouter(config));

  startImageProcessingWorker(config);
  setInterval(() => {
    runCleanupOnce(config).catch((error) => logger.error("Cleanup tick failed", { error: toErrorMessage(error) }));
  }, 60 * 60 * 1000);

  app.listen(config.PORT, () => {
    logger.info("API server started", {
      port: config.PORT,
      nodeEnv: config.NODE_ENV,
      whatsappDryRun: config.whatsappDryRun
    });
  });
};

void (async () => {
  try {
    await bootstrap();
  } catch (error) {
    logger.error("API bootstrap failed", { error: toErrorMessage(error) });
    process.exit(1);
  }
})();
