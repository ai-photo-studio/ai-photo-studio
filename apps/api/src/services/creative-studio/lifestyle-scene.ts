import type { CreativeType, CreativeSceneType, LifestyleTemplate } from "./creative-types";
import { prisma } from "../../db/prisma";
import { logger } from "../../utils/logger";
import { CreativeProviderFactory } from "../../providers/creative-provider.factory";
import type { AppConfig } from "../../config/env";

export type LifestyleSceneInput = {
  body: Buffer;
  contentType?: string;
  fileName?: string;
  template?: LifestyleTemplate;
  orderId?: string;
  orderImageId?: string;
};

export type LifestyleSceneOutput = {
  requestId: string;
  imageBase64: string;
  contentType: string;
  fileName: string;
  durationMs?: number;
  outputStorageKey?: string;
  outputUrl?: string;
};

export class LifestyleSceneService {
  private readonly providerFactory: CreativeProviderFactory;

  constructor(config: AppConfig) {
    this.providerFactory = new CreativeProviderFactory(config);
  }

  async generate(input: LifestyleSceneInput): Promise<LifestyleSceneOutput> {
    const startTime = Date.now();
    const requestId = `lifestyle-scene-${Date.now()}`;
    const template = input.template || "home";
    const provider = this.providerFactory.create("mock");

    try {
      const result = await provider.generateLifestyleScene({ body: input.body, sceneType: template });
      const resultBuffer = result.body;
      const durationMs = Date.now() - startTime;
      const outputContentType = input.contentType || "image/png";

      await this.persistJob({
        requestId,
        orderId: input.orderId,
        orderImageId: input.orderImageId,
        creativeType: "LIFESTYLE_SCENE",
        sceneType: this.mapTemplateToSceneType(template),
        template,
        providerUsed: provider.name,
        status: "COMPLETED",
        durationMs,
        inputSizeBytes: input.body.length,
        outputSizeBytes: resultBuffer.length
      });

      const encoded = resultBuffer.toString("base64");
      return {
        requestId,
        imageBase64: encoded,
        contentType: outputContentType,
        fileName: input.fileName || "lifestyle-scene.png",
        durationMs,
        outputStorageKey: resultBuffer.length.toString(),
        outputUrl: undefined
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error("Lifestyle scene generation failed", { error, requestId, durationMs });

      await this.persistJob({
        requestId,
        orderId: input.orderId,
        orderImageId: input.orderImageId,
        creativeType: "LIFESTYLE_SCENE",
        sceneType: this.mapTemplateToSceneType(template),
        template,
        providerUsed: provider.name,
        status: "FAILED",
        durationMs,
        inputSizeBytes: input.body.length
      });

      throw error;
    }
  }

  private mapTemplateToSceneType(template: LifestyleTemplate): CreativeSceneType {
    const sceneMap: Record<LifestyleTemplate, CreativeSceneType> = {
      home: "LIFESTYLE",
      office: "LIFESTYLE",
      luxury: "STUDIO",
      outdoor: "LIFESTYLE"
    };
    return sceneMap[template];
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