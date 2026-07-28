import type { AppConfig } from "../../config/env";

export interface ReplicateFoundationConfig {
  readonly apiToken: string;
  readonly apiBaseUrl: string;
  readonly modelSlug: string;
  readonly modelVersion?: string;
  readonly requestWaitSeconds: number;
  readonly cancelAfterSeconds: number;
  readonly pollIntervalMs: number;
  readonly pollTimeoutMs: number;
  readonly maxPollAttempts: number;
}

export const getReplicateFoundationConfig = (config: AppConfig): ReplicateFoundationConfig => ({
  apiToken: config.REPLICATE_API_TOKEN,
  apiBaseUrl: process.env.REPLICATE_API_BASE_URL || "https://api.replicate.com/v1",
  modelSlug: config.REPLICATE_BACKGROUND_REMOVAL_MODEL_SLUG || config.REPLICATE_RESTORATION_MODEL_SLUG,
  modelVersion: config.REPLICATE_BACKGROUND_REMOVAL_MODEL_VERSION || config.REPLICATE_RESTORATION_MODEL_VERSION || undefined,
  requestWaitSeconds: Number(process.env.REPLICATE_REQUEST_WAIT_SECONDS || 60),
  cancelAfterSeconds: Number(process.env.REPLICATE_CANCEL_AFTER_SECONDS || 120),
  pollIntervalMs: Number(process.env.REPLICATE_POLL_INTERVAL_MS || 1000),
  pollTimeoutMs: Number(process.env.REPLICATE_POLL_TIMEOUT_MS || 60000),
  maxPollAttempts: Number(process.env.REPLICATE_MAX_POLL_ATTEMPTS || 60),
});
