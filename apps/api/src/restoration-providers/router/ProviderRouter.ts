import type { IRestorationProvider, ProviderStatus, RestorationRequest, RestorationResult, RoutingContext, RoutingDecision } from "../interfaces/IRestorationProvider";
import { ProviderMetricsCollector } from "../monitoring/ProviderMetrics";

export type ShadowMode = "disabled" | "enabled";
export type ABTestMode = "disabled" | "control" | "test" | "split_50" | "weighted_90";

export interface RouterConfig {
  shadowMode: ShadowMode;
  abTestMode: ABTestMode;
  failoverCooldownMs: number;
  maxRetries: number;
}

export class ProviderRouter {
  private readonly providers: Map<string, IRestorationProvider> = new Map();
  private readonly metrics: ProviderMetricsCollector;
  private readonly config: RouterConfig;
  private readonly failureCounts: Map<string, number> = new Map();
  private readonly lastFailureTime: Map<string, number> = new Map();

  private static readonly DEGRADED_THRESHOLD = 3;
  private static readonly DOWN_THRESHOLD = 5;

  constructor(config: RouterConfig, metrics?: ProviderMetricsCollector) {
    this.config = config;
    this.metrics = metrics ?? new ProviderMetricsCollector();
  }

  registerProvider(provider: IRestorationProvider): void {
    this.providers.set(provider.name, provider);
  }

  getProvider(name: string): IRestorationProvider | undefined {
    return this.providers.get(name);
  }

  async route(
    request: RestorationRequest,
    context: RoutingContext,
    decision: RoutingDecision
  ): Promise<RestorationResult> {
    const primaryName = decision.primaryProvider;
    const fallbackName = decision.fallbackProvider;
    const shadowName = decision.shadowProvider;

    const primary = this.providers.get(primaryName);
    if (!primary) {
      throw new Error(`Primary provider not found: ${primaryName}`);
    }

    let shadowResult: RestorationResult | null = null;
    if (shadowName && this.config.shadowMode === "enabled") {
      const shadowProvider = this.providers.get(shadowName);
      if (shadowProvider) {
        void this.executeShadow(shadowProvider, request, shadowName).then((result) => {
          shadowResult = result;
        }).catch((err) => {
          void 0;
        });
      }
    }

    const result = await this.executeWithRetry(primary, request, primaryName);

    return result;
  }

  async executeWithRetry(
    provider: IRestorationProvider,
    request: RestorationRequest,
    providerName: string
  ): Promise<RestorationResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      const startTime = Date.now();
      try {
        const result = await provider.restore(request);
        const latency = Date.now() - startTime;
        this.metrics.recordSuccess(providerName, latency, result.estimatedCost);
        this.resetFailureCount(providerName);
        return result;
      } catch (err) {
        const latency = Date.now() - startTime;
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.metrics.recordFailure(providerName, latency, errorMessage);
        this.recordFailure(providerName);
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError ?? new Error(`Provider ${providerName} failed after ${this.config.maxRetries + 1} attempts`);
  }

  private async executeShadow(
    provider: IRestorationProvider,
    request: RestorationRequest,
    providerName: string
  ): Promise<RestorationResult> {
    const startTime = Date.now();
    const result = await provider.restore(request);
    const latency = Date.now() - startTime;
    this.metrics.recordSuccess(`${providerName}-shadow`, latency, result.estimatedCost);
    return result;
  }

  private recordFailure(providerName: string): void {
    const count = this.failureCounts.get(providerName) ?? 0;
    this.failureCounts.set(providerName, count + 1);
    this.lastFailureTime.set(providerName, Date.now());

    const provider = this.providers.get(providerName);
    if (!provider) return;

    if (count + 1 >= ProviderRouter.DOWN_THRESHOLD) {
      provider.status = "down";
    } else if (count + 1 >= ProviderRouter.DEGRADED_THRESHOLD) {
      provider.status = "degraded";
    }
  }

  private resetFailureCount(providerName: string): void {
    this.failureCounts.delete(providerName);
    this.lastFailureTime.delete(providerName);
    const provider = this.providers.get(providerName);
    if (provider) {
      provider.status = "active";
    }
  }

  isProviderAvailable(providerName: string): boolean {
    const provider = this.providers.get(providerName);
    if (!provider) return false;
    return provider.status !== "down";
  }

  getProviderStatus(providerName: string): ProviderStatus | null {
    const provider = this.providers.get(providerName);
    return provider ? provider.status : null;
  }

  getMetrics(): ProviderMetricsCollector {
    return this.metrics;
  }
}
