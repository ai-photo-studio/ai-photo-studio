import type { IRestorationProvider, ProviderHealth, ProviderStatus, RestorationRequest, RestorationResult } from "../interfaces/IRestorationProvider";
import { logger } from "../../utils/logger";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[];
  error?: string | null;
  metrics?: {
    predict_time?: number;
    total_time?: number;
    gpu_seconds?: number;
  };
  urls?: {
    get: string;
    cancel?: string;
  };
}

// CodeFormer: Robust face restoration model on Replicate
// Official model — does not require a version ID for prediction creation
const MODEL_OWNER = "sczhou";
const MODEL_NAME = "codeformer";
const MODEL_VERSION = "cc4956dd26fa5a7185d5660cc9100fab1b8070a1d1654a8bb5eb6d443b020bb2";

export class ReplicateProvider implements IRestorationProvider {
  readonly name = "replicate";
  readonly type = "commercial" as const;
  status: ProviderStatus = "active";

  private readonly apiKey: string;
  private readonly maxRetries: number = 3;
  private readonly pollIntervalMs: number = 1000;
  private readonly maxPollTimeMs: number = 60000;
  private readonly cancelAfterMs: number = 120000;
  private currentPredictionId: string | null = null;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.REPLICATE_API_TOKEN || "";
  }

  async restore(request: RestorationRequest): Promise<RestorationResult> {
    if (!this.apiKey) {
      throw new Error("Replicate API token not configured");
    }

    const startTime = Date.now();
    const base64Image = request.image.toString("base64");

    const prediction = await this.createPrediction(base64Image, request.contentType, request.options?.upscaleScale);
    this.currentPredictionId = prediction.id;

    if (prediction.status !== "succeeded") {
      const polled = await this.pollPrediction(prediction.id);
      this.currentPredictionId = null;
      return this.handleResult(polled, startTime, request);
    }

    this.currentPredictionId = null;
    return this.handleResult(prediction, startTime, request);
  }

  async cancel(): Promise<void> {
    if (this.currentPredictionId) {
      await this.cancelPrediction(this.currentPredictionId);
      this.currentPredictionId = null;
    }
  }

  private async createPrediction(base64Image: string, contentType: string, upscaleScale?: number): Promise<ReplicatePrediction> {
    const cancelAfterSeconds = Math.floor(this.cancelAfterMs / 1000);
    const response = await fetch(`${REPLICATE_API_BASE}/models/${MODEL_OWNER}/${MODEL_NAME}/versions/${MODEL_VERSION}/predictions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
        "Prefer": "wait=60",
        "Cancel-After": `${cancelAfterSeconds}s`,
      },
      body: JSON.stringify({
        input: {
          image: `data:${contentType || "image/png"};base64,${base64Image}`,
          upscale: upscaleScale || 1,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error("Replicate API request failed", { status: response.status, body: body.slice(0, 300) });
      throw new Error(`Replicate API failed (${response.status}): ${body.slice(0, 200)}`);
    }

    return (await response.json()) as ReplicatePrediction;
  }

  private async pollPrediction(predictionId: string): Promise<ReplicatePrediction> {
    const deadline = Date.now() + this.maxPollTimeMs;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));

      const response = await fetch(`${REPLICATE_API_BASE}/predictions/${predictionId}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Replicate poll failed (${response.status})`);
      }

      const prediction = (await response.json()) as ReplicatePrediction;

      if (prediction.status === "succeeded") {
        return prediction;
      }

      if (prediction.status === "failed") {
        throw new Error(`Replicate prediction failed: ${prediction.error || "unknown error"}`);
      }

      if (prediction.status === "canceled") {
        throw new Error("Replicate prediction was canceled");
      }
    }

    throw new Error("Replicate prediction timed out");
  }

  private async handleResult(prediction: ReplicatePrediction, startTime: number, request: RestorationRequest): Promise<RestorationResult> {
    const processingTimeMs = Date.now() - startTime;

    if (!prediction.output) {
      throw new Error("Replicate API returned no output");
    }

    let outputUrl: string;
    if (typeof prediction.output === "string") {
      outputUrl = prediction.output;
    } else if (Array.isArray(prediction.output) && prediction.output.length > 0) {
      outputUrl = prediction.output[0];
    } else {
      throw new Error("Replicate API returned no image data");
    }

    // Download the result image from the URL
    const imgResponse = await fetch(outputUrl);
    if (!imgResponse.ok) {
      throw new Error(`Replicate failed to download result image: ${imgResponse.status}`);
    }
    const outputBuffer = Buffer.from(await imgResponse.arrayBuffer());

    // Replicate returns GPU seconds in metrics.predict_time (seconds of GPU compute)
    // Official pricing: $0.00085 per GPU second for CodeFormer (T4 GPU)
    const gpuSeconds = prediction.metrics?.predict_time || prediction.metrics?.gpu_seconds || 0;
    const actualCost = this.calculateActualCost(gpuSeconds);
    const estimatedCost = this.estimateCost(request);

    return {
      image: outputBuffer,
      contentType: "image/png",
      fileName: request.fileName,
      providerName: this.name,
      providerVersion: `${MODEL_OWNER}/${MODEL_NAME}@${MODEL_VERSION}`,
      stages: ["restoration"],
      processingTimeMs,
      creditsUsed: 0,
      estimatedCost,
      actualCost,
      actualGPUSeconds: gpuSeconds,
      actualProviderCharge: actualCost,
      requestId: prediction.id,
      costSource: "calculated",
    };
  }

  private async cancelPrediction(predictionId: string): Promise<void> {
    try {
      await fetch(`${REPLICATE_API_BASE}/predictions/${predictionId}/cancel`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
        },
      });
    } catch (err) {
      logger.warn("Failed to cancel Replicate prediction", { predictionId, error: err instanceof Error ? err.message : String(err) });
    }
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

      const response = await fetch(`${REPLICATE_API_BASE}/models`, {
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
    return 0.0034;
  }

  private calculateActualCost(gpuSeconds: number): number {
    // Replicate CodeFormer: $0.00085 per GPU second (T4 GPU pricing)
    // Source: https://replicate.com/docs/reference/providers
    return Math.round(gpuSeconds * 0.00085 * 10000) / 10000;
  }
}
