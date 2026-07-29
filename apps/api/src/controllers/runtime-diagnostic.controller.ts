import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";

export class RuntimeDiagnosticController {
  constructor(private readonly config: AppConfig) {}

  get = async (_req: Request, res: Response): Promise<void> => {
    res.json({
      success: true,
      data: {
        provider: this.config.restorationProvider,
        dryRunEnabled: this.config.restorationDryRun,
        providerIsMock: this.config.restorationProvider === "mock",
        paidTestsAllowed: this.config.allowPaidAiTests,
        replicateConfigured: Boolean(
          process.env.REPLICATE_API_TOKEN &&
          process.env.REPLICATE_RESTORATION_MODEL_SLUG &&
          process.env.REPLICATE_RESTORATION_MODEL_VERSION
        ),
        replicateCreditAvailable: null,
        buildSha: process.env.BUILD_SHA || "unknown"
      }
    });
  };
}
