export type ProviderType = "commercial" | "self-hosted" | "internal";

export type ProviderStatus = "active" | "degraded" | "down";

export interface IRestorationProvider {
  readonly name: string;
  readonly type: ProviderType;
  status: ProviderStatus;

  restore(request: RestorationRequest): Promise<RestorationResult>;
  health(): Promise<ProviderHealth>;
  estimateCost(request: RestorationRequest): number;
}

export interface RestorationRequest {
  image: Buffer;
  contentType: string;
  fileName: string;
  options?: {
    restoreFaces?: boolean;
    colorize?: boolean;
    upscale?: boolean;
    upscaleScale?: number;
    denoise?: number;
    fidelity?: number;
  };
}

export interface RestorationResult {
  image: Buffer;
  contentType: string;
  fileName: string;
  providerName: string;
  providerVersion: string;
  stages: string[];
  processingTimeMs: number;
  creditsUsed: number;
  estimatedCost: number;
  actualCost?: number;
  actualGPUSeconds?: number;
  actualProviderCharge?: number;
  requestId?: string;
  costSource?: "actual" | "calculated" | "estimated";
}

export interface ProviderHealth {
  status: ProviderStatus;
  latency: number;
  errorRate: number;
  lastChecked: string;
  quotaRemaining?: number;
}

export interface ProviderMetrics {
  providerName: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalLatencyMs: number;
  totalCost: number;
  lastError?: string;
  lastErrorAt?: string;
}

export type PackageTier = "preview" | "basic" | "premium" | "print" | "archive";

export type CustomerPackage = "original_restore" | "hd_2x" | "premium_printable";

export interface PackageRoutingDecision {
  packageName: CustomerPackage;
  primaryProvider: string;
  fallbackProvider: string | null;
  reason: string;
  qualityScore: number;
  costPerImage: number;
}

export interface RoutingContext {
  packageTier: PackageTier;
  imageCategory?: string;
  damageSeverity?: string;
  hasFaces?: boolean;
  isBlackAndWhite?: boolean;
  imageSizeBytes?: number;
}

export interface RoutingDecision {
  primaryProvider: string;
  fallbackProvider: string | null;
  shadowProvider: string | null;
  reason: string;
}
