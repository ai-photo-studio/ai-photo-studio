import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import type { ServiceHealth } from "./service-health.types";
import { ReplicateRembgImageProvider } from "../providers/replicate-rembg.provider";

export class BackgroundRemoverService {
  private readonly provider: ReplicateRembgImageProvider;

  constructor(private readonly config: AppConfig) {
    this.provider = new ReplicateRembgImageProvider(config);
  }

  async productTransparent(input: {
    body: Buffer;
    contentType?: string;
    fileName?: string;
  }): Promise<{ body: Buffer; contentType: string; fileName: string }> {
    try {
      const output = await this.provider.processProductImage({
        buffer: input.body,
        contentType: input.contentType || "image/png",
        fileName: input.fileName || "product-transparent.png",
        orderId: "background-removal",
        orderNo: "background-removal",
        workflowMode: "WHITE_BACKGROUND",
        selectedActions: ["white-background"]
      }, undefined);

      return {
        body: output.buffer,
        contentType: output.contentType,
        fileName: output.fileName
      };
    } catch (error) {
      logger.warn("Background remover request failed", { error: error instanceof Error ? error.message : String(error) });
      if (error instanceof AppError) throw error;
      throw new AppError("Background remover failed", 502, "BACKGROUND_API_FAILED");
    }
  }

  async productWhite(input: {
    body: Buffer;
    contentType?: string;
    fileName?: string;
  }): Promise<{ body: Buffer; contentType: string; fileName: string }> {
    const baseUrl = this.config.BACKGROUND_API_URL.trim();
    if (!baseUrl) {
      throw new AppError("Background remover service is not configured", 503, "BACKGROUND_API_UNAVAILABLE");
    }

    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/product-white`, {
      method: "POST",
      headers: {
        "Content-Type": input.contentType || "application/octet-stream"
      },
      body: input.body as unknown as BodyInit
    });

    if (!response.ok) {
      const body = await response.text();
      logger.warn("Background remover request failed", { status: response.status });
      const statusCode = response.status === 422 ? 422 : 502;
      const code = response.status === 422 ? "BACKGROUND_REMOVAL_REJECTED" : "BACKGROUND_API_FAILED";
      throw new AppError(`Background remover failed: ${body.slice(0, 200)}`, statusCode, code);
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/jpeg";
    return {
      body: Buffer.from(arrayBuffer),
      contentType,
      fileName: input.fileName || "product-white.jpg"
    };
  }

  async health(): Promise<ServiceHealth> {
    try {
      const ready = Boolean(this.config.REPLICATE_API_TOKEN && this.config.REPLICATE_BACKGROUND_REMOVAL_MODEL_SLUG);
      if (!ready) {
        return {
          healthy: false,
          status: "unconfigured",
          message: "Replicate background-removal is not configured",
          checkedAt: new Date().toISOString()
        };
      }
      return { healthy: true, status: "ok", checkedAt: new Date().toISOString() };
    } catch (error) {
      return {
        healthy: false,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        checkedAt: new Date().toISOString()
      };
    }
  }
}
