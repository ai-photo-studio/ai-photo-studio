// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- pre-existing; removing @ts-nocheck is a behavior change out of scope for this harness pass.
// @ts-nocheck
import { createHash } from "node:crypto";
import { prisma } from "../../db/prisma";
import type {
  IRestorationProvider,
  ProviderHealth,
  ProviderStatus,
  RestorationRequest,
  RestorationResult,
} from "../interfaces/IRestorationProvider";
import { BaseReplicateProvider } from "./BaseReplicateProvider";
import { FluxRestoreProvider } from "./FluxRestoreProvider";
import { GFPGANProvider } from "./GFPGANProvider";
import { logger } from "../../utils/logger";

const L40S_RATE_USD_PER_SECOND = 0.000975;

/** Cost-controlled production restoration: Flux, then one GFPGAN face-restoration call. */
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

    const result1 = await this.runStage("flux_restore", this.fluxRestore, request);
    stages.push("flux_restore");
    this.logStage("OPS-116 stage 1 completed", "flux_restore", request.image, result1);

    const result2 = await this.runStage("gfpgan_face_restore", this.gfpgan, {
      image: result1.image,
      contentType: result1.contentType,
      fileName: request.fileName,
       options: { ...request.options, upscale: false, upscaleScale: Number(process.env.GFPGAN_SCALE || 1) },
    });
    stages.push("gfpgan_face_restore");
    this.logStage("OPS-116 stage 2 completed", "gfpgan_face_restore", result1.image, result2);

    const totalActualCost = (result1.actualCost ?? result1.estimatedCost)
      + (result2.actualCost ?? result2.estimatedCost);
    const costCeiling = Number(process.env.REPLICATE_ORDER_COST_CEILING_USD || 0.15);
    if (totalActualCost > costCeiling) {
      throw new Error(`Replicate order cost ceiling exceeded: $${totalActualCost.toFixed(6)} > $${costCeiling.toFixed(6)}`);
    }

    logger.info("Replicate order cost audit", {
      orderId: request.options?.orderId,
      itemId: request.options?.itemId,
      predictionCount: 2,
      predictionIds: [result1.requestId, result2.requestId],
      totalActualCost,
      costCeiling,
    });

    return {
      image: result2.image,
      contentType: result2.contentType,
      fileName: request.fileName,
      providerName: this.name,
      providerVersion: "2.1.0 (flux+gfpgan-face-restoration-scale-1)",
      stages,
      processingTimeMs: Date.now() - startTime,
      creditsUsed: 0,
      estimatedCost: this.estimateCost(request),
      actualCost: totalActualCost,
      actualGPUSeconds: (result1.actualGPUSeconds || 0) + (result2.actualGPUSeconds || 0),
      requestId: `${result1.requestId},${result2.requestId}`,
      costSource: "calculated",
      outputWidth: result2.outputWidth,
      outputHeight: result2.outputHeight,
      outputSizeBytes: result2.outputSizeBytes,
    };
  }

  estimateCost(_request: RestorationRequest): number {
    return 0.014;
  }

  async health(): Promise<ProviderHealth> {
    return this.fluxRestore.health();
  }

  private async runStage(stageKey: string, provider: BaseReplicateProvider, request: RestorationRequest): Promise<RestorationResult> {
    const itemId = request.options?.itemId;
    const existingPredictionId = itemId ? await this.readPredictionId(itemId, stageKey) : undefined;
    const result = await provider.restore({
      ...request,
      options: {
        ...request.options,
        stageKey,
        existingPredictionId,
        onPredictionCreated: itemId
          ? async (predictionId, retryCount) => this.persistPredictionId(itemId, stageKey, predictionId, retryCount)
          : undefined,
      },
    });

    if ((result.runningTimeMs || 0) >= Number(process.env.REPLICATE_DURATION_ALERT_MS || 30_000)) {
      logger.warn("Replicate duration alert", {
        stageKey,
        itemId,
        predictionId: result.requestId,
        runningTimeMs: result.runningTimeMs,
      });
    }
    if (itemId) await this.persistCost(itemId, request.options?.orderId, stageKey, result);
    return result;
  }

  private async readPredictionId(itemId: string, stageKey: string): Promise<string | undefined> {
    const item = await prisma.restorationItem.findUnique({ where: { id: itemId }, select: { metadata: true } });
    const stages = asRecord(asRecord(asRecord(item?.metadata).replicateCostAudit).stages);
    const predictionId = asRecord(stages[stageKey]).predictionId;
    return typeof predictionId === "string" ? predictionId : undefined;
  }

  private async persistPredictionId(itemId: string, stageKey: string, predictionId: string, retryCount: number): Promise<void> {
    const item = await prisma.restorationItem.findUnique({ where: { id: itemId }, select: { metadata: true } });
    const metadata = asRecord(item?.metadata);
    const audit = asRecord(metadata.replicateCostAudit);
    const stages = asRecord(audit.stages);
    const existing = asRecord(stages[stageKey]);
    if (existing.predictionId && existing.predictionId !== predictionId) {
      throw new Error(`Idempotency violation for ${stageKey}: prediction already exists`);
    }
    stages[stageKey] = { ...existing, predictionId, retryCount, createdAt: new Date().toISOString() };
    await prisma.restorationItem.update({
      where: { id: itemId },
      data: { metadata: { ...metadata, replicateCostAudit: { ...audit, stages } } },
    });
  }

  private async persistCost(itemId: string, orderId: string | undefined, stageKey: string, result: RestorationResult): Promise<void> {
    const metadata = {
      orderId,
      predictionId: result.requestId,
      model: result.model,
      version: result.modelVersion,
      inputWidth: result.inputWidth,
      inputHeight: result.inputHeight,
      outputWidth: result.outputWidth,
      outputHeight: result.outputHeight,
      queueTimeMs: result.queueTimeMs,
      runningTimeMs: result.runningTimeMs,
      retryCount: result.retryCount || 0,
      rateUsdPerSecond: L40S_RATE_USD_PER_SECOND,
    };
    const existing = await prisma.providerCostLog.findFirst({
      where: { restorationItemId: itemId, operation: stageKey },
      orderBy: { createdAt: "desc" },
    });
    const data = {
      provider: result.model || result.providerName,
      operation: stageKey,
      costType: stageKey === "flux_restore" ? "RESTORATION_INPAINT" : "RESTORATION_FACE",
      durationMs: result.runningTimeMs || result.processingTimeMs,
      inputSizeBytes: result.inputSizeBytes,
      outputSizeBytes: result.outputSizeBytes,
      estimatedCost: result.estimatedCost,
      actualCost: result.actualCost,
      restorationItemId: itemId,
      metadata,
    } as const;
    if (existing) await prisma.providerCostLog.update({ where: { id: existing.id }, data });
    else await prisma.providerCostLog.create({ data });
  }

  private logStage(message: string, stage: string, input: Buffer, result: RestorationResult): void {
    logger.info(message, {
      stage,
      predictionId: result.requestId,
      model: result.model,
      version: result.modelVersion,
      queueTimeMs: result.queueTimeMs,
      runningTimeMs: result.runningTimeMs,
      retryCount: result.retryCount,
      cost: result.actualCost,
      inputDimensions: `${result.inputWidth}x${result.inputHeight}`,
      inputSizeBytes: result.inputSizeBytes,
      outputDimensions: `${result.outputWidth}x${result.outputHeight}`,
      outputSizeBytes: result.outputSizeBytes,
      inputSha: sha256(input).substring(0, 16),
      outputSha: sha256(result.image).substring(0, 16),
    });
  }
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, any>) }
    : {};
}
