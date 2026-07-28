import { buildReplicatePredictionRequest } from "./requestBuilder";
import { ReplicatePollingService } from "./polling";
import { mapReplicateError } from "./errorMapper";
import { mapReplicateInternalStatus, mapReplicateStatus } from "./statusMapper";
import type {
  ReplicateCostRecord,
  ReplicatePrediction,
  ReplicatePredictionRequest,
  ReplicateProviderContract,
} from "./types";
import type { ReplicateFoundationConfig } from "./config";
import type { ReplicateCostLogger } from "./costLogger";

export class ReplicateServiceWrapper implements ReplicateProviderContract {
  readonly name = "replicate";
  readonly apiToken: string;
  readonly apiBaseUrl: string;
  readonly modelSlug: string;
  readonly modelVersion?: string;
  readonly timeoutMs: number;

  private readonly config: ReplicateFoundationConfig;
  private readonly costLogger: ReplicateCostLogger;

  constructor(config: ReplicateFoundationConfig, costLogger: ReplicateCostLogger) {
    this.config = config;
    this.costLogger = costLogger;
    this.apiToken = config.apiToken;
    this.apiBaseUrl = config.apiBaseUrl;
    this.modelSlug = config.modelSlug;
    this.modelVersion = config.modelVersion || undefined;
    this.timeoutMs = config.pollTimeoutMs;
  }

  async createPrediction(request: ReplicatePredictionRequest): Promise<ReplicatePrediction> {
    if (!this.modelSlug) {
      throw new Error("Verification Required: Replicate model slug is not configured");
    }
    try {
      const response = await fetch(this.getPredictionUrl(), {
        method: "POST",
        headers: this.getHeaders(request),
        body: JSON.stringify({
          input: request.modelInput,
          ...(request.metadata ? { metadata: request.metadata } : {}),
        }),
      });

      if (!response.ok) {
        throw Object.assign(new Error(`Replicate createPrediction failed (${response.status})`), { statusCode: response.status });
      }

      return (await response.json()) as ReplicatePrediction;
    } catch (error) {
      throw new Error(mapReplicateError(error).message);
    }
  }

  async getPrediction(predictionId: string): Promise<ReplicatePrediction> {
    const response = await fetch(`${this.apiBaseUrl}/predictions/${predictionId}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw Object.assign(new Error(`Replicate getPrediction failed (${response.status})`), { statusCode: response.status });
    }

    return (await response.json()) as ReplicatePrediction;
  }

  async cancelPrediction(predictionId: string): Promise<void> {
    await fetch(`${this.apiBaseUrl}/predictions/${predictionId}/cancel`, {
      method: "POST",
      headers: this.getHeaders(),
    });
  }

  async pollPrediction(predictionId: string, options = {}): Promise<ReplicatePrediction> {
    return new ReplicatePollingService(this).poll(predictionId, options);
  }

  async createAndPollPrediction(request: ReplicatePredictionRequest): Promise<ReplicatePrediction> {
    const prediction = await this.createPrediction(request);
    if (mapReplicateStatus(prediction.status) === "succeeded" || mapReplicateStatus(prediction.status) === "failed") {
      return prediction;
    }
    return this.pollPrediction(prediction.id);
  }

  async logPredictionCost(prediction: ReplicatePrediction, request: ReplicatePredictionRequest): Promise<void> {
    const gpuSeconds = prediction.metrics?.predict_time ?? prediction.metrics?.gpu_seconds ?? 0;
    const actualCost = Math.round(gpuSeconds * 0.00085 * 10000) / 10000;
    const record: ReplicateCostRecord = {
      predictionId: prediction.id,
      modelSlug: this.modelSlug,
      modelVersion: this.modelVersion,
      predictedSeconds: prediction.metrics?.predict_time,
      actualSeconds: prediction.metrics?.total_time,
      estimatedCost: 0.0034,
      actualCost,
      currency: "USD",
      createdAt: new Date().toISOString(),
    };
    await this.costLogger.log(record);
    void request;
  }

  buildPredictionRequest(options: Parameters<typeof buildReplicatePredictionRequest>[1]): ReplicatePredictionRequest {
    return buildReplicatePredictionRequest(this, options);
  }

  getInternalStatus(prediction: ReplicatePrediction) {
    return mapReplicateInternalStatus(prediction.status);
  }

  private getPredictionUrl(): string {
    if (!this.modelSlug) {
      throw new Error("Verification Required: Replicate model slug is not configured");
    }
    return `${this.apiBaseUrl}/models/${this.modelSlug}/predictions`;
  }

  private getHeaders(request?: Pick<ReplicatePredictionRequest, "cancelAfter" | "waitSeconds">): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      "Content-Type": "application/json",
      Prefer: `wait=${request?.waitSeconds ?? this.config.requestWaitSeconds}`,
      "Cancel-After": request?.cancelAfter ?? `${this.config.cancelAfterSeconds}s`,
    };
  }
}
