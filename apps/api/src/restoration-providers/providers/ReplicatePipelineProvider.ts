// @ts-nocheck
import { BaseReplicateProvider, type ModelConfig } from "./BaseReplicateProvider";
import type { IRestorationProvider, ProviderHealth, ProviderStatus, RestorationRequest, RestorationResult } from "../interfaces/IRestorationProvider";
import { FluxRestoreProvider } from "./FluxRestoreProvider";
import { GFPGANProvider } from "./GFPGANProvider";
import { logger } from "../../utils/logger";

/**
 * OPS-116 Replicate Pipeline Provider.
 *
 * Executes 3 sequential Replicate calls replicating the OPS-109 production pipeline:
 *   1. flux-kontext-apps/restore-image  (FluxRestoreProvider)
 *   2. tencentarc/gfpgan                (GFPGANProvider — face restoration)
 *   3. tencentarc/gfpgan scale=2        (GFPGANProvider — upscaling)
 *
 * Every stage records: timestamp, provider, model, prediction id, runtime, cost,
 * input SHA256, output SHA256, resolution.
 */
export class ReplicatePipelineProvider implements IRestorationProvider {
  readonly name = "replicate-pipeline";
  readonly type = "commercial" as const;
  status: ProviderStatus = "active";

  private readonly fluxRestore: FluxRestoreProvider;
  private readonly gfpgan: GFPGANProvider;

  constructor(apiKey?: string) {
    this.fluxRestore = new FluxRestoreProvider(apiKey);
    this.gfpgan = new GFPGANProvider(apiKey);
  }

  async restore(request: RestorationRequest): Promise<RestorationResult> {
    const startTime = Date.now();
    const stages: string[] = [];

    // Stage 1: FLUX Restore
    const stage1Start = Date.now();
    const result1 = await this.fluxRestore.restore(request);
    const stage1Time = Date.now() - stage1Start;
    stages.push("flux_restore");

    logger.info("OPS-116 stage 1 completed", {
      stage: "flux_restore",
      label: "flux-kontext-apps/restore-image",
      predictionId: result1.requestId,
      runtimeMs: stage1Time,
      cost: result1.actualCost ?? result1.estimatedCost,
      inputSha: sha256(request.image).substring(0, 16),
      outputSha: sha256(result1.image).substring(0, 16),
      resolution: `${result1.image.length}B`,
    });

    // Stage 2: GFPGAN face restoration
    const stage2Start = Date.now();
    const result2 = await this.gfpgan.restore({
      image: result1.image,
      contentType: result1.contentType,
      fileName: request.fileName,
    });
    const stage2Time = Date.now() - stage2Start;
    stages.push("gfpgan_face");

    logger.info("OPS-116 stage 2 completed", {
      stage: "gfpgan_face",
      label: "tencentarc/gfpgan (v1.4)",
      predictionId: result2.requestId,
      runtimeMs: stage2Time,
      cost: result2.actualCost ?? result2.estimatedCost,
      inputSha: sha256(result1.image).substring(0, 16),
      outputSha: sha256(result2.image).substring(0, 16),
      resolution: `${result2.image.length}B`,
    });

    // Stage 3: GFPGAN upscaling (scale=2, acting as Real-ESRGAN)
    const stage3Start = Date.now();
    const result3 = await this.gfpgan.restore({
      image: result2.image,
      contentType: result2.contentType,
      fileName: request.fileName,
      options: { upscale: true, upscaleScale: 2 },
    });
    const stage3Time = Date.now() - stage3Start;
    stages.push("gfpgan_upscale");

    logger.info("OPS-116 stage 3 completed", {
      stage: "gfpgan_upscale",
      label: "tencentarc/gfpgan (scale=2)",
      predictionId: result3.requestId,
      runtimeMs: stage3Time,
      cost: result3.actualCost ?? result3.estimatedCost,
      inputSha: sha256(result2.image).substring(0, 16),
      outputSha: sha256(result3.image).substring(0, 16),
      resolution: `${result3.image.length}B`,
    });

    const processingTimeMs = Date.now() - startTime;
    const totalActualCost = (result1.actualCost ?? result1.estimatedCost)
      + (result2.actualCost ?? result2.estimatedCost)
      + (result3.actualCost ?? result3.estimatedCost);

    return {
      image: result3.image,
      contentType: result3.contentType,
      fileName: request.fileName,
      providerName: this.name,
      providerVersion: "1.0.0 (flux+gfpgan+upscale)",
      stages,
      processingTimeMs,
      creditsUsed: 0,
      estimatedCost: this.estimateCost(request),
      actualCost: totalActualCost,
      actualGPUSeconds: (result1.actualGPUSeconds || 0) + (result2.actualGPUSeconds || 0) + (result3.actualGPUSeconds || 0),
      requestId: `${result1.requestId},${result2.requestId},${result3.requestId}`,
      costSource: "calculated",
    };
  }

  estimateCost(_request: RestorationRequest): number {
    return 0.009 + 0.005 + 0.005; // flux + gfpgan + upscale
  }

  async health(): Promise<ProviderHealth> {
    return this.fluxRestore.health();
  }
}

function sha256(buf: Buffer): string {
  const { createHash } = require("node:crypto");
  return createHash("sha256").update(buf).digest("hex");
}
