import "dotenv/config";
import express from "express";
import { loadConfig } from "./config/env";
import { createOrderRouter } from "./routes/order.routes";
import { createPaymentRouter } from "./routes/payment.routes";
import { createWhatsAppRouter } from "./routes/whatsapp.routes";
import { createAdminRouter } from "./routes/admin.routes";
import { createAuthRouter } from "./routes/auth.routes";
import { createPackageRouter } from "./routes/package.routes";
import { createCorsMiddleware } from "./middleware/cors.middleware";
import { rateLimit } from "./middleware/rate-limit.middleware";
import { logger } from "./utils/logger";
import { toErrorMessage } from "./utils/errors";
import { startImageProcessingWorker } from "./workers/image-processing.worker";
import { runCleanupOnce } from "./workers/cleanup.worker";

const bootstrap = () => {
  const config = loadConfig();
  const app = express();

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

  app.use("/api", createWhatsAppRouter(config));
  app.use("/api", createOrderRouter(config));
  app.use("/api", createPaymentRouter(config));
  app.use("/api", createAdminRouter(config));
  app.use("/api", createAuthRouter(config));
  app.use("/api", createPackageRouter(config));

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

try {
  bootstrap();
} catch (error) {
  logger.error("API bootstrap failed", { error: toErrorMessage(error) });
  process.exit(1);
}
