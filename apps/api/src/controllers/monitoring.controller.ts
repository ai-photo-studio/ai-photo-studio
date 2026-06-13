import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { QueueHealthService } from "../services/queue-health.service";
import { getWorkerHealthState } from "../services/worker-health.service";
import { AppError, toErrorMessage } from "../utils/errors";
import { logger } from "../utils/logger";
import { BackgroundRemoverService } from "../services/background-remover.service";
import { YoloDetectorService } from "../services/yolo-detector.service";
import { RealEsrganService } from "../services/real-esrgan.service";
import { ICLightLabService } from "../services/ic-light-lab.service";
import { ProductClassifierService } from "../services/product-classifier.service";

export class MonitoringController {
  private readonly queueHealth: QueueHealthService;
  private readonly rembg: BackgroundRemoverService;
  private readonly yolo: YoloDetectorService;
  private readonly esrgan: RealEsrganService;
  private readonly iclight: ICLightLabService;
  private readonly classifier: ProductClassifierService;

  constructor(private readonly config: AppConfig) {
    this.queueHealth = new QueueHealthService(config);
    this.rembg = new BackgroundRemoverService(config);
    this.yolo = new YoloDetectorService(config);
    this.esrgan = new RealEsrganService(config);
    this.iclight = new ICLightLabService(config);
    this.classifier = new ProductClassifierService(config);
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

  services = async (_req: Request, res: Response): Promise<void> => {
    const [rembgHealth, yoloHealth, esrganHealth, iclightHealth, classifierHealth] = await Promise.allSettled([
      this.rembg.health(),
      this.yolo.health(),
      this.esrgan.health(),
      this.iclight.health(),
      this.classifier.health()
    ]);

    res.json({
      success: true,
      data: {
        rembg: rembgHealth.status === "fulfilled" ? rembgHealth.value : { status: "error", error: String(rembgHealth.reason) },
        yolo: yoloHealth.status === "fulfilled" ? yoloHealth.value : { status: "error", error: String(yoloHealth.reason) },
        esrgan: esrganHealth.status === "fulfilled" ? esrganHealth.value : { status: "error", error: String(esrganHealth.reason) },
        iclight: iclightHealth.status === "fulfilled" ? iclightHealth.value : { status: "error", error: String(iclightHealth.reason) },
        classifier: classifierHealth.status === "fulfilled" ? classifierHealth.value : { status: "error", error: String(classifierHealth.reason) }
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