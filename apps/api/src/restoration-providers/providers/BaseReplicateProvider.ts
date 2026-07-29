import type { IRestorationProvider, ProviderHealth, ProviderStatus, RestorationRequest, RestorationResult } from "../interfaces/IRestorationProvider";
import { logger } from "../../utils/logger";
import sharp from "sharp";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled" | "aborted";
  output?: string | string[];
  error?: string | null;
  metrics?: {
    predict_time?: number;
    total_time?: number;
    gpu_seconds?: number;
  };
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  urls?: {
    get: string;
    cancel?: string;
  };
}

export interface ModelConfig {
  owner: string;
  name: string;
  version: string;
  inputFields: Record<string, string>; // field name -> description
}

export abstract class BaseReplicateProvider implements IRestorationProvider {
  abstract readonly name: string;
  abstract readonly description: string;
  readonly type = "commercial" as const;
  status: ProviderStatus = "active";

  protected abstract readonly modelConfig: ModelConfig;
  protected abstract readonly costPerGpuSecond: number;
  protected abstract readonly estimatedCostPerRun: number;

  protected readonly apiKey: string;
  private readonly maxRetries: number = 1;
  private readonly pollIntervalMs: number = 1000;
  private readonly maxPollTimeMs: number = 75000;
  private readonly cancelAfterMs: number = 60000;
  private currentPredictionId: string | null = null;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.REPLICATE_API_TOKEN || "";
  }

  abstract buildInput(request: RestorationRequest): Record<string, unknown>;

  async restore(request: RestorationRequest): Promise<RestorationResult> {
    if (!this.apiKey) {
      throw new Error("Replicate API token not configured");
    }

    const startTime = Date.now();
    const created = request.options?.existingPredictionId
      ? { prediction: await this.getPrediction(request.options.existingPredictionId), retryCount: 0 }
      : await this.createPrediction(request);
    const prediction = created.prediction;
    if (!request.options?.existingPredictionId) {
      await request.options?.onPredictionCreated?.(prediction.id, created.retryCount);
    }
    this.currentPredictionId = prediction.id;

    if (prediction.status !== "succeeded") {
      const polled = await this.pollPrediction(prediction.id);
      this.currentPredictionId = null;
      return this.handleResult(polled, startTime, request, created.retryCount);
    }

    this.currentPredictionId = null;
    return this.handleResult(prediction, startTime, request, created.retryCount);
  }

  async cancel(): Promise<void> {
    if (this.currentPredictionId) {
      await this.cancelPrediction(this.currentPredictionId);
      this.currentPredictionId = null;
    }
  }

  private async createPrediction(request: RestorationRequest): Promise<{ prediction: ReplicatePrediction; retryCount: number }> {
    const cancelAfterSeconds = Math.floor(this.cancelAfterMs / 1000);
    const versionUrl = `${REPLICATE_API_BASE}/models/${this.modelConfig.owner}/${this.modelConfig.name}/versions/${this.modelConfig.version}/predictions`;

    const input = this.buildInput(request);

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const response = await fetch(versionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
          "Prefer": "wait=60",
          "Cancel-After": `${cancelAfterSeconds}s`,
        },
        body: JSON.stringify({ input }),
      });

      if (response.ok) {
        return { prediction: (await response.json()) as ReplicatePrediction, retryCount: attempt };
      }

      const body = await response.text();
      if (response.status === 429 && attempt < this.maxRetries) {
        const retryAfterMs = Math.max(parseRetryAfterMs(response.headers.get("retry-after")), 12_000);
        logger.warn("Replicate prediction creation rate limited", {
          model: `${this.modelConfig.owner}/${this.modelConfig.name}`,
          attempt: attempt + 1,
          retryAfterMs
        });
        await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
        continue;
      }

      logger.error("Replicate API request failed", { model: `${this.modelConfig.owner}/${this.modelConfig.name}`, status: response.status, body: body.slice(0, 300) });
      throw new Error(`Replicate API failed (${response.status}): ${body.slice(0, 200)}`);
    }

    throw new Error("Replicate prediction retry limit exceeded");
  }

  private async getPrediction(predictionId: string): Promise<ReplicatePrediction> {
    const response = await fetch(`${REPLICATE_API_BASE}/predictions/${predictionId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!response.ok) throw new Error(`Replicate existing prediction lookup failed (${response.status})`);
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

      if (prediction.status === "aborted") {
        throw new Error("Replicate prediction was aborted by the configured deadline");
      }
    }

    throw new Error("Replicate prediction timed out");
  }

  private async handleResult(prediction: ReplicatePrediction, startTime: number, request: RestorationRequest, retryCount: number): Promise<RestorationResult> {
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

    const imgResponse = await fetch(outputUrl);
    if (!imgResponse.ok) {
      throw new Error(`Replicate failed to download result image: ${imgResponse.status}`);
    }
    const outputBuffer = Buffer.from(await imgResponse.arrayBuffer());

    const [inputMetadata, outputMetadata] = await Promise.all([
      sharp(request.image).metadata(),
      sharp(outputBuffer).metadata(),
    ]);

    const gpuSeconds = prediction.metrics?.predict_time || prediction.metrics?.gpu_seconds || 0;
    const actualCost = this.calculateActualCost(gpuSeconds);
    const estimatedCost = this.estimateCost(request);

    return {
      image: outputBuffer,
      contentType: "image/png",
      fileName: request.fileName,
      providerName: this.name,
      providerVersion: `${this.modelConfig.owner}/${this.modelConfig.name}@${this.modelConfig.version}`,
      stages: [this.description],
      processingTimeMs,
      creditsUsed: 0,
      estimatedCost,
      actualCost,
      actualGPUSeconds: gpuSeconds,
      actualProviderCharge: actualCost,
      requestId: prediction.id,
      costSource: "calculated",
      model: `${this.modelConfig.owner}/${this.modelConfig.name}`,
      modelVersion: this.modelConfig.version,
      inputWidth: inputMetadata.width,
      inputHeight: inputMetadata.height,
      inputSizeBytes: request.image.length,
      outputWidth: outputMetadata.width,
      outputHeight: outputMetadata.height,
      outputSizeBytes: outputBuffer.length,
      queueTimeMs: durationMs(prediction.created_at, prediction.started_at),
      runningTimeMs: Math.round(gpuSeconds * 1000),
      retryCount,
    };
  }

  private async cancelPrediction(predictionId: string): Promise<void> {
    try {
      await fetch(`${REPLICATE_API_BASE}/predictions/${predictionId}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
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

  estimateCost(_request: RestorationRequest): number {
    return this.estimatedCostPerRun;
  }

  private calculateActualCost(gpuSeconds: number): number {
    return Math.round(gpuSeconds * this.costPerGpuSecond * 1_000_000) / 1_000_000;
  }
}

const parseRetryAfterMs = (value: string | null): number => {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 0;
};

const durationMs = (from?: string, to?: string): number | undefined => {
  if (!from || !to) return undefined;
  const value = Date.parse(to) - Date.parse(from);
  return Number.isFinite(value) ? Math.max(0, value) : undefined;
};
