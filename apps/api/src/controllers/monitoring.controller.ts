import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { QueueHealthService } from "../services/queue-health.service";
import { getWorkerHealthState } from "../services/worker-health.service";
import { AppError, toErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";

export class MonitoringController {
  private readonly queueHealth: QueueHealthService;

  constructor(private readonly config: AppConfig) {
    this.queueHealth = new QueueHealthService(config);
  }

  health = async (_req: Request, res: Response): Promise<void> => {
    res.json({
      success: true,
      data: {
        status: "ok",
        service: "api",
        environment: this.config.NODE_ENV,
        deliveryMode: this.config.deliveryMode,
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString()
      }
    });
  };

  queue = async (_req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.queueHealth.inspectImageQueue();
      res.json({ success: true, data });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  worker = async (_req: Request, res: Response): Promise<void> => {
    const state = getWorkerHealthState();
    res.json({
      success: true,
      data: {
        ...state,
        healthy: state.running,
        uptimeSeconds: state.startedAt ? Math.max(0, Math.round((Date.now() - new Date(state.startedAt).getTime()) / 1000)) : 0
      }
    });
  };

  private handleError(res: Response, error: unknown) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      return;
    }
    logger.error("Monitoring endpoint failed", { error: toErrorMessage(error) });
    res.status(500).json({ success: false, code: "INTERNAL_ERROR", message: toErrorMessage(error) });
  }
}
