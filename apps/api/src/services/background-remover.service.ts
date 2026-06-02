import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";

export class BackgroundRemoverService {
  constructor(private readonly config: AppConfig) {}

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
      throw new AppError(`Background remover failed: ${body.slice(0, 200)}`, 502, "BACKGROUND_API_FAILED");
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/jpeg";
    return {
      body: Buffer.from(arrayBuffer),
      contentType,
      fileName: input.fileName || "product-white.jpg"
    };
  }
}
