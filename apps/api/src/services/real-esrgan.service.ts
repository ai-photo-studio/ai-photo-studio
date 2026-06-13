import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";

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
}
