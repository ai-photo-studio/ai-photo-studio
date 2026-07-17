import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import type { ServiceHealth } from "./service-health.types";
import { runRunPodRequest } from "../providers/runpod.transport";

export type RealEsrganEnhanceInput = {
  body: Buffer;
  contentType?: string;
  fileName?: string;
  scale?: number;
  sharpen?: number;
  denoise?: number;
};

export type RealEsrganEnhanceOutput = {
  body: Buffer;
  contentType: string;
  fileName: string;
};

export class RealEsrganService {
  constructor(private readonly config: AppConfig) {}

  async enhance(input: RealEsrganEnhanceInput): Promise<RealEsrganEnhanceOutput> {
    const baseUrl = this.config.REAL_ESRGAN_URL.trim();
    if (!baseUrl) {
      logger.warn("Real-ESRGAN service not configured; returning the source image unchanged");
      return {
        body: Buffer.from(input.body),
        contentType: input.contentType || "image/png",
        fileName: input.fileName || "enhanced.png"
      };
    }

    // Route to RunPod if baseUrl is an endpoint ID
    if (baseUrl.length < 30 && !baseUrl.includes("://") && !baseUrl.includes(".")) {
      return this.runViaRunPod(input, baseUrl);
    }

    const url = new URL(`${baseUrl.replace(/\/$/, "")}/enhance`);
    if (typeof input.scale === "number") {
      url.searchParams.set("scale", String(input.scale));
    }
    if (typeof input.sharpen === "number") {
      url.searchParams.set("sharpen", String(input.sharpen));
    }
    if (typeof input.denoise === "number") {
      url.searchParams.set("denoise", String(input.denoise));
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": input.contentType || "application/octet-stream",
        "X-File-Name": input.fileName || "upload.png"
      },
      body: input.body as unknown as BodyInit
    });

    if (!response.ok) {
      const body = await response.text();
      logger.warn("Real-ESRGAN request failed", { status: response.status });
      throw new AppError(`Real-ESRGAN failed: ${body.slice(0, 200)}`, 502, "REAL_ESRGAN_FAILED");
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/png";
    const fileName = response.headers.get("x-file-name") || input.fileName || "enhanced.png";
    return {
      body: Buffer.from(arrayBuffer),
      contentType,
      fileName
    };
  }

  private async runViaRunPod(
    input: RealEsrganEnhanceInput,
    endpointId: string
  ): Promise<RealEsrganEnhanceOutput> {
    const apiKey = process.env.RUNPOD_API_KEY || "";
    if (!apiKey) {
      throw new AppError("RunPod API key not configured", 503, "RUNPOD_API_KEY_MISSING");
    }
    const base64Image = input.body.toString("base64");
    const result = await runRunPodRequest(apiKey, endpointId, {
      image: `data:${input.contentType || "image/png"};base64,${base64Image}`,
      content_type: input.contentType || "image/png",
      file_name: input.fileName || "product.png",
      scale: input.scale ?? 2.0,
      sharpen: input.sharpen ?? 0.55,
      denoise: input.denoise ?? 0.3,
    });
    const outputB64 = result.image as string;
    return {
      body: Buffer.from(outputB64, "base64"),
      contentType: (result.media_type as string) || "image/png",
      fileName: (result.filename as string) || input.fileName || "enhanced.png",
    };
  }

  async health(): Promise<ServiceHealth> {
    const baseUrl = this.config.REAL_ESRGAN_URL.trim();
    if (!baseUrl) {
      return { healthy: false, status: "unconfigured", message: "REAL_ESRGAN_URL is not configured; pass-through mode enabled", checkedAt: new Date().toISOString() };
    }

    try {
      const endpoint = `${baseUrl.replace(/\/$/, "")}/health`;
      const response = await fetch(endpoint, { method: "GET" });
      if (!response.ok) {
        const body = await response.text();
        return { healthy: false, status: "error", endpoint, statusCode: response.status, message: body.slice(0, 200), checkedAt: new Date().toISOString() };
      }
      return { healthy: true, status: "ok", endpoint, checkedAt: new Date().toISOString() };
    } catch (error) {
      return {
        healthy: false,
        status: "error",
        endpoint: `${baseUrl.replace(/\/$/, "")}/health`,
        message: error instanceof Error ? error.message : String(error),
        checkedAt: new Date().toISOString()
      };
    }
  }
}
