import type { ProviderMetrics as ProviderMetricsType } from "../interfaces/IRestorationProvider";

export class ProviderMetricsCollector {
  private readonly metrics: Map<string, ProviderMetricsType> = new Map();

  recordSuccess(providerName: string, latencyMs: number, cost: number): void {
    const current = this.getOrCreate(providerName);
    current.totalRequests++;
    current.successfulRequests++;
    current.totalLatencyMs += latencyMs;
    current.totalCost += cost;
  }

  recordFailure(providerName: string, latencyMs: number, error: string): void {
    const current = this.getOrCreate(providerName);
    current.totalRequests++;
    current.failedRequests++;
    current.totalLatencyMs += latencyMs;
    current.lastError = error;
    current.lastErrorAt = new Date().toISOString();
  }

  getMetrics(providerName: string): ProviderMetricsType | undefined {
    return this.metrics.get(providerName);
  }

  getAllMetrics(): ProviderMetricsType[] {
    return Array.from(this.metrics.values());
  }

  getErrorRate(providerName: string): number {
    const metrics = this.metrics.get(providerName);
    if (!metrics || metrics.totalRequests === 0) return 0;
    return metrics.failedRequests / metrics.totalRequests;
  }

  getAverageLatency(providerName: string): number {
    const metrics = this.metrics.get(providerName);
    if (!metrics || metrics.totalRequests === 0) return 0;
    return metrics.totalLatencyMs / metrics.totalRequests;
  }

  reset(): void {
    this.metrics.clear();
  }

  private getOrCreate(providerName: string): ProviderMetricsType {
    let metrics = this.metrics.get(providerName);
    if (!metrics) {
      metrics = {
        providerName,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalLatencyMs: 0,
        totalCost: 0,
      };
      this.metrics.set(providerName, metrics);
    }
    return metrics;
  }
}
