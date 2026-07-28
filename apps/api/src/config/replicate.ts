import type { AppConfig } from "./env";

export interface ReplicateRuntimeConfig {
  readonly apiToken: string;
  readonly apiBaseUrl: string;
  readonly restorationModelSlug: string;
  readonly restorationModelVersion: string;
  readonly backgroundRemovalModelSlug: string;
  readonly backgroundRemovalModelVersion: string;
  readonly requestWaitSeconds: number;
  readonly cancelAfterSeconds: number;
  readonly pollIntervalMs: number;
  readonly pollTimeoutMs: number;
  readonly maxPollAttempts: number;
  readonly restorationEnabled: boolean;
  readonly backgroundRemovalEnabled: boolean;
}

const DEFAULT_API_BASE_URL = "https://api.replicate.com/v1";

const toBoolean = (value: string | boolean | undefined): boolean => {
  if (typeof value === "boolean") return value;
  return String(value || "").toLowerCase() === "true";
};

export const getReplicateRuntimeConfig = (config: AppConfig): ReplicateRuntimeConfig => ({
  apiToken: config.REPLICATE_API_TOKEN || "",
  apiBaseUrl: process.env.REPLICATE_API_BASE_URL || DEFAULT_API_BASE_URL,
  restorationModelSlug: config.REPLICATE_RESTORATION_MODEL_SLUG || "",
  restorationModelVersion: config.REPLICATE_RESTORATION_MODEL_VERSION || "",
  backgroundRemovalModelSlug: config.REPLICATE_BACKGROUND_REMOVAL_MODEL_SLUG || "lucataco/remove-bg",
  backgroundRemovalModelVersion: config.REPLICATE_BACKGROUND_REMOVAL_MODEL_VERSION || "95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1",
  requestWaitSeconds: Number(process.env.REPLICATE_REQUEST_WAIT_SECONDS || 60),
  cancelAfterSeconds: Number(process.env.REPLICATE_CANCEL_AFTER_SECONDS || 120),
  pollIntervalMs: Number(process.env.REPLICATE_POLL_INTERVAL_MS || 1000),
  pollTimeoutMs: Number(process.env.REPLICATE_POLL_TIMEOUT_MS || 60000),
  maxPollAttempts: Number(process.env.REPLICATE_MAX_POLL_ATTEMPTS || 60),
  restorationEnabled: toBoolean(config.ENABLE_REPLICATE_RESTORATION_PROVIDER),
  backgroundRemovalEnabled: toBoolean(config.ENABLE_REPLICATE_BACKGROUND_REMOVAL_PROVIDER),
});
