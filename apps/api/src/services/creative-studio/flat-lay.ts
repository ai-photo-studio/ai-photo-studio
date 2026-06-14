import type { CreativeType, CreativeSceneType, FlatLayTemplate } from "./creative-types";
import { prisma } from "../../db/prisma";
import { logger } from "../../utils/logger";

export type FlatLayBackground = "white" | "marble" | "wood" | "ecommerce";

export type FlatLayInput = {
  body: Buffer;
  contentType?: string;
  fileName?: string;
  template?: FlatLayTemplate;
  background?: FlatLayBackground;
  orderId?: string;
  orderImageId?: string;
};

export type FlatLayOutput = {
  requestId: string;
  imageBase64: string;
  contentType: string;
  fileName: string;
  durationMs?: number;
};

export class FlatLayService {
  async generate(input: FlatLayInput): Promise<FlatLayOutput> {
    const startTime = Date.now();
    const requestId = `flat-lay-${Date.now()}`;
    const background = input.background || "white";

    try {
      let resultBuffer: Buffer;
      let outputContentType = input.contentType || "image/png";

      switch (background) {
        case "white":
          resultBuffer = await this.generateWhiteBackground(input.body, input.contentType);
          break;
        case "marble":
          resultBuffer = await this.generateMarbleBackground(input.body, input.contentType);
          break;
        case "wood":
          resultBuffer = await this.generateWoodBackground(input.body, input.contentType);
          break;
        case "ecommerce":
          resultBuffer = await this.generateEcommerceBackground(input.body, input.contentType);
          break;
        default:
          resultBuffer = await this.generateWhiteBackground(input.body, input.contentType);
      }

      const durationMs = Date.now() - startTime;

      await this.persistJob({
        requestId,
        orderId: input.orderId,
        orderImageId: input.orderImageId,
        creativeType: "FLAT_LAY",
        sceneType: "TABLETOP",
        template: input.template || "ecommerce-flatlay",
        background,
        providerUsed: "flat-lay-mock",
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
        fileName: input.fileName || "flat-lay.png",
        durationMs
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error("Flat lay generation failed", { error, requestId, durationMs });

      await this.persistJob({
        requestId,
        orderId: input.orderId,
        orderImageId: input.orderImageId,
        creativeType: "FLAT_LAY",
        sceneType: "TABLETOP",
        template: input.template || "ecommerce-flatlay",
        background,
        providerUsed: "flat-lay-mock",
        status: "FAILED",
        durationMs,
        inputSizeBytes: input.body.length
      });

      throw error;
    }
  }

  private async generateWhiteBackground(body: Buffer, contentType?: string): Promise<Buffer> {
    return body;
  }

  private async generateMarbleBackground(body: Buffer, contentType?: string): Promise<Buffer> {
    return body;
  }

  private async generateWoodBackground(body: Buffer, contentType?: string): Promise<Buffer> {
    return body;
  }

  private async generateEcommerceBackground(body: Buffer, contentType?: string): Promise<Buffer> {
    return body;
  }

  private async persistJob(params: {
    requestId: string;
    orderId?: string;
    orderImageId?: string;
    creativeType: CreativeType;
    sceneType: CreativeSceneType;
    template: string;
    background?: string;
    providerUsed: string;
    status: "PENDING" | "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
    durationMs?: number;
    inputSizeBytes?: number;
    outputSizeBytes?: number;
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
          metadata: { background: params.background },
          inputStorageKey: params.inputSizeBytes ? `${params.inputSizeBytes} bytes` : null,
          outputStorageKey: params.outputSizeBytes ? `${params.outputSizeBytes} bytes` : null
        }
      });
    } catch (error) {
      logger.warn("Failed to persist creative studio job", { error, requestId: params.requestId });
    }
  }
}