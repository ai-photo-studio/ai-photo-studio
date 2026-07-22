import type { AppConfig } from "../../config/env";
import type { IRestorationProvider, ProviderHealth, ProviderStatus, RestorationRequest, RestorationResult } from "../interfaces/IRestorationProvider";
import { logger } from "../../utils/logger";

const OPENAI_API_BASE = "https://api.openai.com/v1";

interface OpenAIImageEditResponse {
  created: number;
  data: Array<{
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

interface OpenAIModel {
  id: string;
  object: string;
  owned_by: string;
}

interface OpenAIModelsResponse {
  object: string;
  data: OpenAIModel[];
}

// OpenAI image edit pricing per 1024x1024 image
const IMAGE_EDIT_PRICING: Record<string, number> = {
  "gpt-image-beta": 0.04,
  "dall-e-3": 0.04,
  "dall-e-2": 0.02,
};

// OpenAI image edit pricing per 1024x1024 image (token-based for gpt-image-beta)
const GPT_IMAGE_TOKEN_COST = {
  input: 0.000015,
  output: 0.00006,
};

export class OpenAIProvider implements IRestorationProvider {
  readonly name = "openai";
  readonly type = "commercial" as const;
  status: ProviderStatus = "active";

  private readonly apiKey: string;
  private cachedModels: string[] | null = null;
  private cachedModelTimestamp: number = 0;
  private readonly modelCacheTtlMs = 300000;

  constructor(config: AppConfig) {
    this.apiKey = config.OPENAI_API_KEY || "";
  }

  async restore(request: RestorationRequest): Promise<RestorationResult> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const startTime = Date.now();
    const base64Image = request.image.toString("base64");
    const imageSize = this.estimateImageSize(request.image);

    const model = await this.detectBestImageModel();

    let result: OpenAIImageEditResponse;
    let operation = "restoration";

    if (request.options?.colorize) {
      result = await this.editImage(base64Image, request.contentType, model, "Colorize this black and white photograph, adding natural and realistic colors throughout. Restore faded areas and enhance contrast.");
      operation = "colorization";
    } else if (request.options?.upscale) {
      result = await this.editImage(base64Image, request.contentType, model, "Upscale this image to higher resolution while preserving all details. Enhance sharpness and clarity.");
      operation = "upscale";
    } else if (request.options?.restoreFaces) {
      result = await this.editImage(base64Image, request.contentType, model, "Restore faces in this photograph. Fix scratches, reduce noise, enhance facial features while preserving natural appearance.");
      operation = "face-restoration";
    } else {
      result = await this.editImage(base64Image, request.contentType, model, "Restore this damaged photograph. Remove scratches, reduce noise, enhance contrast and sharpness, and improve overall quality while preserving the original character of the image.");
      operation = "restoration";
    }

    const processingTimeMs = Date.now() - startTime;
    const outputB64 = result.data[0]?.b64_json || "";
    let outputBuffer: Buffer;

    if (outputB64) {
      outputBuffer = Buffer.from(outputB64, "base64");
    } else {
      const outputUrl = result.data[0]?.url;
      if (!outputUrl) {
        throw new Error("OpenAI API returned no image data");
      }
      const imgResponse = await fetch(outputUrl);
      if (!imgResponse.ok) {
        throw new Error(`OpenAI failed to download result image: ${imgResponse.status}`);
      }
      outputBuffer = Buffer.from(await imgResponse.arrayBuffer());
    }

    const estimatedCost = this.estimateCost(request);
    const { actualCost, costSource } = this.calculateActualCost(model, result.usage);

    logger.info("OpenAI restoration completed", {
      operation,
      model,
      processingTimeMs,
      estimatedCost,
      actualCost,
      imageSize,
    });

    return {
      image: outputBuffer,
      contentType: "image/png",
      fileName: request.fileName,
      providerName: this.name,
      providerVersion: model,
      stages: [operation],
      processingTimeMs,
      creditsUsed: 0,
      estimatedCost,
      actualCost,
      requestId: result.created.toString(),
      costSource,
    };
  }

  private async detectBestImageModel(): Promise<string> {
    const now = Date.now();
    if (this.cachedModels && now - this.cachedModelTimestamp < this.modelCacheTtlMs) {
      const best = this.selectBestModel(this.cachedModels);
      if (best) return best;
    }

    try {
      const response = await fetch(`${OPENAI_API_BASE}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!response.ok) {
        throw new Error(`OpenAI models API failed (${response.status})`);
      }

      const modelsData = (await response.json()) as OpenAIModelsResponse;
      const modelIds = modelsData.data.map((m) => m.id);
      this.cachedModels = modelIds;
      this.cachedModelTimestamp = now;

      const best = this.selectBestModel(modelIds);
      if (best) return best;
    } catch (err) {
      logger.warn("Failed to detect OpenAI models, falling back to default", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return "gpt-image-beta";
  }

  private selectBestModel(modelIds: string[]): string | null {
    // Priority: gpt-image-beta > dall-e-3 > dall-e-2
    // Do not hardcode — detect from API response
    const imageModels = modelIds.filter(
      (id) =>
        id.includes("gpt-image") ||
        id.includes("dall-e-3") ||
        id.includes("dall-e-2") ||
        id.includes("dall-e")
    );

    if (imageModels.length === 0) return null;

    // Prefer gpt-image-beta (newest), then dall-e-3, then dall-e-2
    const priority = ["gpt-image-beta", "dall-e-3", "dall-e-2"];
    for (const p of priority) {
      const match = imageModels.find((id) => id === p || id.startsWith(p));
      if (match) return match;
    }

    // Return the first image model found
    return imageModels[0];
  }

  private calculateActualCost(
    model: string,
    usage?: OpenAIImageEditResponse["usage"]
  ): { actualCost: number; costSource: "actual" | "calculated" | "estimated" } {
    if (usage && usage.input_tokens && usage.output_tokens) {
      // gpt-image-beta uses token-based pricing
      const inputCost = (usage.input_tokens / 1000) * GPT_IMAGE_TOKEN_COST.input;
      const outputCost = (usage.output_tokens / 1000) * GPT_IMAGE_TOKEN_COST.output;
      return { actualCost: Math.round((inputCost + outputCost) * 100000) / 100000, costSource: "actual" };
    }

    // Fall back to official per-image pricing for the exact model used
    const price = IMAGE_EDIT_PRICING[model] ?? IMAGE_EDIT_PRICING["gpt-image-beta"];
    return { actualCost: price, costSource: "calculated" };
  }

  async health(): Promise<ProviderHealth> {
    if (!this.apiKey) {
      return {
        status: "down",
        latency: 0,
        errorRate: 1,
        lastChecked: new Date().toISOString(),
      };
    }

    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${OPENAI_API_BASE}/models`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const latency = Date.now() - startTime;

      if (!response.ok) {
        return {
          status: "down",
          latency,
          errorRate: 1,
          lastChecked: new Date().toISOString(),
        };
      }

      return {
        status: "active",
        latency,
        errorRate: 0,
        lastChecked: new Date().toISOString(),
      };
    } catch (err) {
      const latency = Date.now() - startTime;
      return {
        status: "down",
        latency,
        errorRate: 1,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  estimateCost(request: RestorationRequest): number {
    // Default estimate: gpt-image-beta edit pricing $0.04/image (1024x1024)
    return IMAGE_EDIT_PRICING["gpt-image-beta"];
  }

  private async editImage(base64Image: string, contentType: string, model: string, prompt: string): Promise<OpenAIImageEditResponse> {
    const formData = new FormData();
    formData.append("model", model);
    formData.append("prompt", prompt);
    formData.append("n", "1");
    formData.append("size", "1024x1024");

    const mime = contentType || "image/png";
    const blob = this.base64ToBlob(base64Image, mime);
    formData.append("image", blob, "input.png");

    const response = await fetch(`${OPENAI_API_BASE}/images/edits`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData as unknown as BodyInit,
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error("OpenAI API request failed", { status: response.status, body: body.slice(0, 300) });
      throw new Error(`OpenAI API failed (${response.status}): ${body.slice(0, 200)}`);
    }

    const result = (await response.json()) as OpenAIImageEditResponse;

    if (!result.data || result.data.length === 0) {
      throw new Error("OpenAI API returned no image data");
    }

    return result;
  }

  private base64ToBlob(base64: string, mimeType: string): Blob {
    const byteChars = Buffer.from(base64, "base64");
    return new Blob([byteChars], { type: mimeType });
  }

  private estimateImageSize(buffer: Buffer): { width: number; height: number; bytes: number } {
    return {
      width: 0,
      height: 0,
      bytes: buffer.length,
    };
  }
}
