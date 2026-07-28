import type { CreativeType, CreativeSceneType, VirtualModelTemplate } from "./creative-types";
import { prisma } from "../../db/prisma";
import { logger } from "../../utils/logger";
import { StorageService } from "../../services/storage.service";
import type { AppConfig } from "../../config/env";

export type VirtualModelInput = {
  body: Buffer;
  contentType?: string;
  fileName?: string;
  template?: VirtualModelTemplate;
  orderId?: string;
  orderImageId?: string;
};

export type VirtualModelOutput = {
  requestId: string;
  imageBase64: string;
  contentType: string;
  fileName: string;
  durationMs?: number;
  outputStorageKey?: string;
  outputUrl?: string;
};

export class VirtualModelService {
  constructor(private readonly config: AppConfig) {}

  async generate(input: VirtualModelInput): Promise<VirtualModelOutput> {
    const startTime = Date.now();
    const requestId = `virtual-model-${Date.now()}`;
    const template = input.template || "male";

    try {
      const resultBuffer = await this.generateModel(input.body, input.contentType, template);
      const durationMs = Date.now() - startTime;
      const outputContentType = input.contentType || "image/png";

      const storage = new StorageService(this.config);
      const uploadResult = await storage.uploadProcessed({
        fileName: input.fileName || "virtual-model.png",
        body: resultBuffer,
        contentType: outputContentType
      });

      await this.persistJob({
        requestId,
        orderId: input.orderId,
        orderImageId: input.orderImageId,
        creativeType: "VIRTUAL_MODEL",
        sceneType: "MODEL",
        template,
        providerUsed: "virtual-model-mock",
        status: "COMPLETED",
        durationMs,
        inputSizeBytes: input.body.length,
        outputSizeBytes: resultBuffer.length,
        outputStorageKey: uploadResult.key,
        outputUrl: uploadResult.url
      });

      const encoded = resultBuffer.toString("base64");
      return {
        requestId,
        imageBase64: encoded,
        contentType: outputContentType,
        fileName: input.fileName || "virtual-model.png",
        durationMs,
        outputStorageKey: uploadResult.key,
        outputUrl: uploadResult.url
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error("Virtual model generation failed", { error, requestId, durationMs });

      await this.persistJob({
        requestId,
        orderId: input.orderId,
        orderImageId: input.orderImageId,
        creativeType: "VIRTUAL_MODEL",
        sceneType: "MODEL",
        template,
        providerUsed: "virtual-model-mock",
        status: "FAILED",
        durationMs,
        inputSizeBytes: input.body.length
      });

      throw error;
    }
  }

  private async generateModel(body: Buffer, contentType: string | undefined, template: VirtualModelTemplate): Promise<Buffer> {
    return body;
  }

  private async persistJob(params: {
    requestId: string;
    orderId?: string;
    orderImageId?: string;
    creativeType: CreativeType;
    sceneType: CreativeSceneType;
    template: string;
    providerUsed: string;
    status: "PENDING" | "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
    durationMs?: number;
    inputSizeBytes?: number;
    outputSizeBytes?: number;
    outputStorageKey?: string;
    outputUrl?: string;
  }) {
    try {
      await prisma.creativeStudioJob.create({
        data: {
          orderId: params.orderId,
          orderImageId: params.orderImageId,
          creativeType: params.creativeType,
          sceneType: params.sceneType,
          generationStatus: params.status,
          providerUsed: params.providerUsed,
          promptSummary: params.template,
          durationMs: params.durationMs,
          estimatedCost: 0,
          actualCost: 0,
          metadata: {},
          inputStorageKey: params.inputSizeBytes ? `${params.inputSizeBytes} bytes` : null,
          outputStorageKey: params.outputStorageKey,
          createdAt: new Date()
        }
      });
    } catch (error) {
      logger.warn("Failed to persist creative studio job", { error, requestId: params.requestId });
    }
  }
}