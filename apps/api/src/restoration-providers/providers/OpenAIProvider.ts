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
}

interface ImageGenUsage {
  input_tokens: number;
  input_tokens_details?: {
    image_tokens: number;
    text_tokens: number;
  };
  output_tokens: number;
  total_tokens: number;
  output_tokens_details?: {
    image_tokens: number;
    text_tokens: number;
  };
}

// DALL-E 3 image edit pricing (per image)
const DALL_E_3_EDIT_COST = 0.04;

export class OpenAIProvider implements IRestorationProvider {
  readonly name = "openai";
  readonly type = "commercial" as const;
  status: ProviderStatus = "active";

  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: AppConfig) {
    this.apiKey = config.OPENAI_API_KEY || "";
    // dall-e-3 is the supported model for /v1/images/edits
    this.model = "dall-e-3";
  }

  async restore(request: RestorationRequest): Promise<RestorationResult> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const startTime = Date.now();

    const base64Image = request.image.toString("base64");
    const imageSize = this.estimateImageSize(request.image);

    let result: OpenAIImageEditResponse;
    let operation = "restoration";

    if (request.options?.colorize) {
      result = await this.editImage(base64Image, request.contentType, "Colorize this black and white photograph, adding natural and realistic colors throughout. Restore faded areas and enhance contrast.");
      operation = "colorization";
    } else if (request.options?.upscale) {
      result = await this.editImage(base64Image, request.contentType, "Upscale this image to higher resolution while preserving all details. Enhance sharpness and clarity.");
      operation = "upscale";
    } else if (request.options?.restoreFaces) {
      result = await this.editImage(base64Image, request.contentType, "Restore faces in this photograph. Fix scratches, reduce noise, enhance facial features while preserving natural appearance.");
      operation = "face-restoration";
    } else {
      result = await this.editImage(base64Image, request.contentType, "Restore this damaged photograph. Remove scratches, reduce noise, enhance contrast and sharpness, and improve overall quality while preserving the original character of the image.");
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

    logger.info("OpenAI restoration completed", {
      operation,
      processingTimeMs,
      estimatedCost,
      imageSize,
    });

    return {
      image: outputBuffer,
      contentType: "image/png",
      fileName: request.fileName,
      providerName: this.name,
      providerVersion: this.model,
      stages: [operation],
      processingTimeMs,
      creditsUsed: 0,
      estimatedCost,
    };
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
        const body = await response.text();
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
    // DALL-E 3 image edits: $0.04/image (1024x1024)
    return DALL_E_3_EDIT_COST;
  }

  private async editImage(base64Image: string, contentType: string, prompt: string): Promise<OpenAIImageEditResponse> {
    const formData = new FormData();
    formData.append("model", "dall-e-3");
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
