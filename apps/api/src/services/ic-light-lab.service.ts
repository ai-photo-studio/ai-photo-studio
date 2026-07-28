import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import type { ServiceHealth } from "./service-health.types";

export type ICLightLabRelightInput = {
  body: Buffer;
  contentType?: string;
  fileName?: string;
  style?: "studio" | "shadow" | "warm" | "cool";
};

export type ICLightLabRelightOutput = {
  requestId: string;
  relightedImageBase64: string;
  shadowImageBase64: string;
  comparisonImageBase64: string;
  originalImageBase64: string;
  contentType: string;
  fileName: string;
};

type ICLightEnvelope = {
  success?: boolean;
  data?: ICLightLabRelightOutput;
  message?: string;
};

export class ICLightLabService {
  constructor(private readonly config: AppConfig) {}

  async relight(input: ICLightLabRelightInput): Promise<ICLightLabRelightOutput> {
    const baseUrl = this.config.IC_LIGHT_LAB_URL.trim();
    if (!baseUrl) {
      logger.warn("IC-Light lab service not configured; returning a pass-through diagnostic payload");
      const encoded = Buffer.from(input.body).toString("base64");
      return {
        requestId: "ic-light-lab-disabled",
        relightedImageBase64: encoded,
        shadowImageBase64: encoded,
        comparisonImageBase64: encoded,
        originalImageBase64: encoded,
        contentType: input.contentType || "image/png",
        fileName: input.fileName || "ic-light-lab.png"
      };
    }

    const url = new URL(`${baseUrl.replace(/\/$/, "")}/relight`);
    if (input.style) {
      url.searchParams.set("style", input.style);
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
      logger.warn("IC-Light lab request failed", { status: response.status });
      throw new AppError(`IC-Light lab failed: ${body.slice(0, 200)}`, 502, "IC_LIGHT_LAB_FAILED");
    }

    const envelope = (await response.json()) as ICLightEnvelope;
    if (!envelope.data) {
      throw new AppError("IC-Light lab returned no data", 502, "IC_LIGHT_LAB_EMPTY");
    }
    return envelope.data;
  }

  async health(): Promise<ServiceHealth> {
    const baseUrl = this.config.IC_LIGHT_LAB_URL.trim();
    if (!baseUrl) {
      return { healthy: false, status: "unconfigured", message: "IC_LIGHT_LAB_URL is not configured; pass-through mode enabled", checkedAt: new Date().toISOString() };
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
