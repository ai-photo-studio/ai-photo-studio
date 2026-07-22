import type { IRestorationProvider, ProviderHealth, ProviderStatus, RestorationRequest, RestorationResult } from "../interfaces/IRestorationProvider";
import { logger } from "../../utils/logger";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

export class ReplicateProvider implements IRestorationProvider {
  readonly name = "replicate";
  readonly type = "commercial" as const;
  status: ProviderStatus = "active";

  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.REPLICATE_API_TOKEN || "";
  }

  async restore(request: RestorationRequest): Promise<RestorationResult> {
    if (!this.apiKey) {
      throw new Error("Replicate API token not configured");
    }

    const startTime = Date.now();
    const base64Image = request.image.toString("base64");

    const model = "tencentarc/gfpgan";
    const response = await fetch(`${REPLICATE_API_BASE}/models/${model}/predictions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
        "Prefer": "wait=60",
      },
      body: JSON.stringify({
        input: {
          img: `data:${request.contentType || "image/png"};base64,${base64Image}`,
          scale: request.options?.upscaleScale || 1,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error("Replicate API request failed", { status: response.status, body: body.slice(0, 300) });
      throw new Error(`Replicate API failed (${response.status}): ${body.slice(0, 200)}`);
    }

    const result = await response.json() as { output?: string | string[]; error?: string };

    if (result.error) {
      throw new Error(`Replicate API error: ${result.error}`);
    }

    let outputBuffer: Buffer;
    if (typeof result.output === "string") {
      if (result.output.startsWith("data:")) {
        const base64 = result.output.split(",")[1];
        outputBuffer = Buffer.from(base64, "base64");
      } else {
        const imgResponse = await fetch(result.output);
        outputBuffer = Buffer.from(await imgResponse.arrayBuffer());
      }
    } else if (Array.isArray(result.output) && result.output.length > 0) {
      const imgResponse = await fetch(result.output[0]);
      outputBuffer = Buffer.from(await imgResponse.arrayBuffer());
    } else {
      throw new Error("Replicate API returned no image data");
    }

    const processingTimeMs = Date.now() - startTime;
    const estimatedCost = this.estimateCost(request);

    return {
      image: outputBuffer,
      contentType: "image/png",
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
      const response = await fetch(`${REPLICATE_API_BASE}/models`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
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

    if (sizeMb < 1) return 0.02;
    if (sizeMb < 4) return 0.05;
    return 0.10;
  }
}
