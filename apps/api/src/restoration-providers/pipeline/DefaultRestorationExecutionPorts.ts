import sharp from "sharp";
import type { RestorationRequest } from "../interfaces/IRestorationProvider";
import type { PipelineOrchestrator, PipelineResult, PipelineTier } from "./PipelineOrchestrator";
import type { StorageService } from "../../services/storage.service";
import { prisma } from "../../db/prisma";
import { logger } from "../../utils/logger";
import {
  RestorationValidationError,
  type CompletionMutationParams,
  type CompletionRepositoryPort,
  type FinalPersistencePort,
  type FinalUploadParams,
  type FinalVariant,
  type FinalVariantsBuilderPort,
  type OutputValidationPort,
  type ProviderExecutionPort,
  type ValidatedRestorationOutput
} from "./RestorationExecutionPorts";

/** Wraps PipelineOrchestrator (Replicate today). This is the seam a future authorized provider router replaces. */
export class PipelineOrchestratorProviderExecutor implements ProviderExecutionPort {
  constructor(private readonly orchestrator: PipelineOrchestrator) {}

  execute(request: RestorationRequest, tier: PipelineTier): Promise<PipelineResult> {
    return this.orchestrator.execute(request, tier);
  }
}

/** Decodes the provider output before it is ever persisted. A decode failure fails closed. */
export class SharpOutputValidator implements OutputValidationPort {
  async validate(result: PipelineResult): Promise<ValidatedRestorationOutput> {
    const image = result.final.image;
    if (!image || image.length === 0) {
      throw new RestorationValidationError("Restoration output image is empty");
    }
    if (!result.final.stages || result.final.stages.length === 0) {
      throw new RestorationValidationError("Restoration output declares no completed stages");
    }
    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(image).metadata();
    } catch (err) {
      throw new RestorationValidationError(
        `Restoration output failed image decode validation: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return {
      image,
      contentType: result.final.contentType,
      width: metadata.width ?? null,
      height: metadata.height ?? null
    };
  }
}

/** Builds the master/2hd/4hd variants that get persisted. Preserves the exact resize/quality settings in production today. */
export class SharpFinalVariantsBuilder implements FinalVariantsBuilderPort {
  async buildVariants(validated: ValidatedRestorationOutput): Promise<Record<"master" | "2hd" | "4hd", FinalVariant>> {
    const master: FinalVariant = {
      body: validated.image,
      width: validated.width,
      height: validated.height,
      contentType: validated.contentType
    };

    const fourHd = await sharp(validated.image, { sequentialRead: true })
      .rotate()
      .resize({ width: 4096, withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });

    const twoHd = await sharp(validated.image, { sequentialRead: true })
      .rotate()
      .resize({ width: 2048 })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });

    return {
      master,
      "4hd": {
        body: fourHd.data,
        width: fourHd.info.width,
        height: fourHd.info.height,
        contentType: "image/jpeg"
      },
      "2hd": {
        body: twoHd.data,
        width: twoHd.info.width,
        height: twoHd.info.height,
        contentType: "image/jpeg"
      }
    };
  }
}

/** R2 persistence for finalized restoration output only (master + variants under the "finals" prefix). */
export class R2FinalPersistence implements FinalPersistencePort {
  constructor(private readonly storage: StorageService) {}

  async uploadFinal(params: FinalUploadParams) {
    logger.info("R2 final upload START", { itemId: params.itemId, variant: params.variant, bodySizeBytes: params.body.length });
    const result = await this.storage.uploadFile({
      keyPrefix: "finals",
      fileName: params.fileName,
      body: params.body,
      contentType: params.contentType
    });
    logger.info("R2 final upload END", { itemId: params.itemId, variant: params.variant, finalStorageKey: result.key });
    return result;
  }
}

/** The only place allowed to mark a restoration item COMPLETED. Runs after validated R2 persistence, never before. */
export class PrismaCompletionRepository implements CompletionRepositoryPort {
  async markCompleted(params: CompletionMutationParams): Promise<void> {
    logger.info("DB completion mutation START", { itemId: params.itemId, orderId: params.orderId, finalStorageKey: params.finalStorageKey });
    await prisma.$transaction(async (tx) => {
      await tx.restorationItem.update({
        where: { id: params.itemId },
        data: {
          status: "COMPLETED",
          finalStorageKey: params.finalStorageKey,
          metadata: params.metadataPatch as any,
          afterQualityScore: params.afterQualityScore,
          providerUsed: params.providerUsed,
          processingStage: params.processingStage,
          totalDurationMs: params.totalDurationMs,
          errorMessage: null
        }
      });
      if (params.orderId) {
        await tx.restorationOrder.update({
          where: { id: params.orderId },
          data: {
            completedItems: { increment: 1 },
            status: "COMPLETED" as any
          }
        });
      }
    });
    logger.info("DB completion mutation END", { itemId: params.itemId, orderId: params.orderId, status: "COMPLETED" });
  }
}
