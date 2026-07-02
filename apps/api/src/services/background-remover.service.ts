import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import type { ServiceHealth } from "./service-health.types";

export class BackgroundRemoverService {
  constructor(private readonly config: AppConfig) {}

  async productTransparent(input: {
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
    const contentType = response.headers.get("content-type") || "image/png";
    return {
      body: Buffer.from(arrayBuffer),
      contentType,
      fileName: input.fileName || "product-transparent.png"
    };
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
    const baseUrl = this.config.BACKGROUND_API_URL.trim();
    if (!baseUrl) {
      return { healthy: false, status: "unconfigured", message: "BACKGROUND_API_URL is not configured", checkedAt: new Date().toISOString() };
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
