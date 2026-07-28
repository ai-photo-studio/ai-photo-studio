import type { RestorationRequest } from "../interfaces/IRestorationProvider";

export type ReplicatePredictionStatus =
  | "starting"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled"
  | "unknown";

export type ReplicateInternalStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "verification_required";

export interface ReplicateProviderContract {
  readonly name: string;
  readonly modelSlug: string;
  readonly modelVersion?: string;
  readonly apiBaseUrl: string;
  readonly timeoutMs: number;

  createPrediction(request: ReplicatePredictionRequest): Promise<ReplicatePrediction>;
  getPrediction(predictionId: string): Promise<ReplicatePrediction>;
  cancelPrediction(predictionId: string): Promise<void>;
  pollPrediction(predictionId: string, options?: ReplicatePollingOptions): Promise<ReplicatePrediction>;
}

export interface ReplicatePredictionRequest {
  readonly request: RestorationRequest;
  readonly imageDataUri: string;
  readonly modelInput: Record<string, unknown>;
  readonly cancelAfter?: string;
  readonly waitSeconds?: number;
  readonly metadata?: Record<string, string>;
}

export interface ReplicatePrediction {
  readonly id: string;
  readonly status: ReplicatePredictionStatus;
  readonly input?: Record<string, unknown>;
  readonly output?: unknown;
  readonly error?: string | null;
  readonly metrics?: {
    readonly predict_time?: number;
    readonly total_time?: number;
    readonly gpu_seconds?: number;
  };
  readonly urls?: {
    readonly get?: string;
    readonly cancel?: string;
    readonly web?: string;
  };
  readonly created_at?: string;
  readonly started_at?: string;
  readonly completed_at?: string;
  readonly version?: string;
  readonly model?: string;
}

export interface ReplicatePollingOptions {
  readonly intervalMs?: number;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly onStatus?: (prediction: ReplicatePrediction, internalStatus: ReplicateInternalStatus) => void;
}

export interface ReplicateErrorMapping {
  readonly category: "retryable" | "non-retryable" | "timeout" | "cancelled" | "verification_required";
  readonly message: string;
  readonly retryAfterMs?: number;
  readonly cause?: unknown;
}

export interface ReplicateCostRecord {
  readonly predictionId: string;
  readonly modelSlug: string;
  readonly modelVersion?: string;
  readonly predictedSeconds?: number;
  readonly actualSeconds?: number;
  readonly estimatedCost?: number;
  readonly actualCost?: number;
  readonly currency: "USD";
  readonly createdAt: string;
}

