import type { IRestorationProvider, ProviderHealth, ProviderStatus, RestorationRequest, RestorationResult } from "../interfaces/IRestorationProvider";
import { logger } from "../../utils/logger";

const FAL_API_BASE = "https://api.fal.ai/v1";

export class FalAiProvider implements IRestorationProvider {
  readonly name = "fal-ai";
  readonly type = "commercial" as const;
  status: ProviderStatus = "active";

  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.FAL_AI_API_KEY || "";
  }

  async restore(request: RestorationRequest): Promise<RestorationResult> {
    if (!this.apiKey) {
      throw new Error("fal.ai API key not configured");
    }

    const startTime = Date.now();
    const base64Image = request.image.toString("base64");

    const response = await fetch(`https://fal.run/fal-ai/old-photo-restoration`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${this.apiKey}`,
      },
      body: JSON.stringify({
        image_url: `data:${request.contentType || "image/png"};base64,${base64Image}`,
        task_type: "restoration",
        scale: request.options?.upscaleScale || 1,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error("fal.ai API request failed", { status: response.status, body: body.slice(0, 300) });
      throw new Error(`fal.ai API failed (${response.status}): ${body.slice(0, 200)}`);
    }

    const result = await response.json() as { image?: string; media_type?: string; processing_time?: number };

    let outputBuffer: Buffer;
    if (result.image) {
      outputBuffer = Buffer.from(result.image, "base64");
    } else {
      throw new Error("fal.ai API returned no image data");
    }

    const processingTimeMs = Date.now() - startTime;
    const estimatedCost = this.estimateCost(request);

    return {
      image: outputBuffer,
      contentType: result.media_type || "image/png",
      fileName: request.fileName,
      providerName: this.name,
      providerVersion: "1.0.0",
      stages: ["restoration"],
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
      const response = await fetch(`https://fal.run/fal-ai/models`, {
        headers: {
          Authorization: `Key ${this.apiKey}`,
        },
      });

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
    const sizeBytes = request.image.length;
    const sizeMb = sizeBytes / (1024 * 1024);

    if (sizeMb < 1) return 0.003;
    if (sizeMb < 4) return 0.008;
    return 0.015;
  }
}
