import type { AppConfig } from "../config/env";

export interface ProcessingMetrics {
  orderId: string;
  itemId: string;
  queueJobId: string;
  totalDurationMs: number;
  stageDurations: Record<string, number>;
  gpuMemoryMb: number;
  cpuPercent: number;
  providerCosts: Record<string, number>;
  qualityBefore: number;
  qualityAfter: number;
  success: boolean;
  error?: string;
}

export interface MetricsRecord {
  timestamp: string;
  metric: string;
  value: number;
  labels: Record<string, string>;
}

export interface MetricsQuery {
  metricName?: string;
  fromTime?: string;
  toTime?: string;
  limit?: number;
  orderBy?: "asc" | "desc";
}

export class MonitoringService {
  constructor(private readonly config: AppConfig) {}

  async recordMetrics(metrics: ProcessingMetrics): Promise<void> {
    // Placeholder — implementation in Sprint 4
    void metrics;
  }

  async queryMetrics(query: MetricsQuery): Promise<MetricsRecord[]> {
    // Placeholder — implementation in Sprint 4
    void query;
    return [];
  }
}
