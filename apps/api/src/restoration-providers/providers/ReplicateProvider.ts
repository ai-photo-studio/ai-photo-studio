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

export class ReplicateProvider implements IRestorationProvider {
  readonly name = "replicate";
  readonly type = "commercial" as const;
  status: ProviderStatus = "active";

  private readonly apiKey: string;
  private readonly maxRetries: number = 3;
  private readonly pollIntervalMs: number = 1000;
  private readonly maxPollTimeMs: number = 60000;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.REPLICATE_API_TOKEN || "";
  }

  async restore(request: RestorationRequest): Promise<RestorationResult> {
    if (!this.apiKey) {
      throw new Error("Replicate API token not configured");
    }

    const startTime = Date.now();
    const base64Image = request.image.toString("base64");

    // Create prediction with sync mode (Prefer: wait=60)
    const prediction = await this.createPrediction(base64Image, request.contentType, request.options?.upscaleScale);

    // If prediction didn't complete in sync wait, poll for result
    if (prediction.status !== "succeeded") {
      const polled = await this.pollPrediction(prediction.id);
      return this.handleResult(polled, startTime, request);
    }

    return this.handleResult(prediction, startTime, request);
  }

  private async createPrediction(base64Image: string, contentType: string, upscaleScale?: number): Promise<ReplicatePrediction> {
    const response = await fetch(`${REPLICATE_API_BASE}/models/${MODEL_OWNER}/${MODEL_NAME}/predictions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
        "Prefer": "wait=60",
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

    const estimatedCost = this.estimateCost(request);

    return {
      image: outputBuffer,
      contentType: "image/png",
      fileName: request.fileName,
      providerName: this.name,
      providerVersion: `${MODEL_OWNER}/${MODEL_NAME}`,
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
    // CodeFormer costs approximately $0.0037 per run
    return 0.0037;
  }
}
