import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import type { ProductCategory } from "../providers/provider.interface";
import type { ServiceHealth } from "./service-health.types";

export type ProductClassificationInput = {
  body: Buffer;
  contentType?: string;
  fileName?: string;
};

export type ProductClassificationResult = {
  category: ProductCategory;
  confidence: number;
  pipelineUsed: string;
  processingProfile: string;
};

type ProductClassifierEnvelope = {
  success?: boolean;
  data?: ProductClassificationResult;
  message?: string;
};

export class ProductClassifierService {
  constructor(private readonly config: AppConfig) {}

  async classify(input: ProductClassificationInput): Promise<ProductClassificationResult> {
    const baseUrl = this.config.PRODUCT_CLASSIFIER_URL.trim();
    if (!baseUrl) {
      return {
        category: "general-product",
        confidence: 0.38,
        pipelineUsed: "fallback:general-product",
        processingProfile: "general-studio"
      };
    }

    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/classify`, {
      method: "POST",
      headers: {
        "Content-Type": input.contentType || "application/octet-stream",
        "X-File-Name": input.fileName || "upload.jpg"
      },
      body: input.body as unknown as BodyInit
    });

    if (!response.ok) {
      const body = await response.text();
      logger.warn("Product classifier request failed", { status: response.status });
      throw new AppError(`Product classifier failed: ${body.slice(0, 200)}`, 502, "PRODUCT_CLASSIFIER_FAILED");
    }

    const envelope = (await response.json()) as ProductClassifierEnvelope;
    if (!envelope.data) {
      throw new AppError("Product classifier returned no data", 502, "PRODUCT_CLASSIFIER_EMPTY");
    }
    return envelope.data;
  }

  async health(): Promise<ServiceHealth> {
    const baseUrl = this.config.PRODUCT_CLASSIFIER_URL.trim();
    if (!baseUrl) {
      return { healthy: false, status: "unconfigured", message: "PRODUCT_CLASSIFIER_URL is not configured; fallback classifier enabled", checkedAt: new Date().toISOString() };
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
