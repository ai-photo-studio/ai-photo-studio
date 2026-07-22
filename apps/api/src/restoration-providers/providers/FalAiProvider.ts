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

    const response = await fetch(`https://fal.run/fal-ai/image-editing/photo-restoration`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${this.apiKey}`,
      },
      body: JSON.stringify({
        image_url: `data:${request.contentType || "image/png"};base64,${base64Image}`,
        sync_mode: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error("fal.ai API request failed", { status: response.status, body: body.slice(0, 300) });
      throw new Error(`fal.ai API failed (${response.status}): ${body.slice(0, 200)}`);
    }

    const result = await response.json() as { images?: Array<{ url?: string }>; image?: string };

    let outputBuffer: Buffer;
    if (result.image) {
      const base64Data = result.image.includes(",") ? result.image.split(",")[1] : result.image;
      outputBuffer = Buffer.from(base64Data, "base64");
    } else if (result.images && result.images.length > 0 && result.images[0].url) {
      const imgResponse = await fetch(result.images[0].url);
      if (!imgResponse.ok) {
        throw new Error(`fal.ai failed to download result image: ${imgResponse.status}`);
      }
      outputBuffer = Buffer.from(await imgResponse.arrayBuffer());
    } else {
      throw new Error("fal.ai API returned no image data");
    }

    const processingTimeMs = Date.now() - startTime;
    const estimatedCost = this.estimateCost(request);

    return {
      image: outputBuffer,
      contentType: "image/png",
      fileName: request.fileName,
      providerName: this.name,
      providerVersion: "fal-ai/image-editing/photo-restoration",
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
      // The fal.ai platform API /v1/models returns models list; a 200 means auth works
      const response = await fetch(`https://api.fal.ai/v1/models`, {
        headers: {
          Authorization: `Key ${this.apiKey}`,
        },
      });

      const latency = Date.now() - startTime;

      // 200 OK means auth works. 403 means API key is valid but account is locked (e.g., balance).
      if (response.status === 403) {
        return {
          status: "degraded",
          latency,
          errorRate: 1,
          lastChecked: new Date().toISOString(),
        };
      }

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
    // Official pricing: $0.04 per image
    return 0.04;
  }
}
