import type { AppConfig } from "../../config/env";
import type { IRestorationProvider, ProviderHealth, ProviderStatus, RestorationRequest, RestorationResult } from "../interfaces/IRestorationProvider";
import { UnifiedRestorationService } from "../../services/restoration-provider.service";
import { logger } from "../../utils/logger";

export class RunPodProvider implements IRestorationProvider {
  readonly name = "runpod";
  readonly type = "self-hosted" as const;
  status: ProviderStatus = "active";

  private readonly restorationService: UnifiedRestorationService;

  constructor(config: AppConfig) {
    this.restorationService = new UnifiedRestorationService(config);
  }

  async restore(request: RestorationRequest): Promise<RestorationResult> {
    const startTime = Date.now();

    const result = await this.restorationService.restore({
      body: request.image,
      contentType: request.contentType,
      fileName: request.fileName,
      scale: request.options?.upscaleScale,
      denoise: request.options?.denoise,
      fidelity: request.options?.fidelity,
    });

    const processingTimeMs = Date.now() - startTime;

    return {
      image: result.body,
      contentType: result.contentType,
      fileName: result.fileName,
      providerName: this.name,
      providerVersion: "1.0.0",
      stages: result.processingStages ?? ["restoration"],
      processingTimeMs,
      creditsUsed: result.creditsUsed ?? 0,
      estimatedCost: this.estimateCost(request),
    };
  }

  async health(): Promise<ProviderHealth> {
    const startTime = Date.now();
    try {
      const health = await this.restorationService.health();
      const latency = Date.now() - startTime;
      return {
        status: health.healthy ? "active" : "degraded",
        latency,
        errorRate: 0,
        lastChecked: new Date().toISOString(),
      };
    } catch (err) {
      const latency = Date.now() - startTime;
      return {
        status: "down",
        latency,
        errorRate: 1,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  estimateCost(request: RestorationRequest): number {
    const sizeBytes = request.image.length;
    const sizeMb = sizeBytes / (1024 * 1024);

    if (sizeMb < 1) return 0.003;
    if (sizeMb < 4) return 0.008;
    return 0.015;
  }
}
