import type { AppConfig } from "../config/env";
import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";
import { ProviderMetricsCollector } from "../restoration-providers/monitoring/ProviderMetrics";

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

export interface ProviderMetricsSummary {
  providerName: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatencyMs: number;
  totalCost: number;
  errorRate: number;
  lastError?: string;
  lastErrorAt?: string;
}

export interface QueueMetricsSummary {
  queueDepth: number;
  activeWorkers: number;
  queuedJobs: number;
  retryingJobs: number;
  deadLetterJobs: number;
  oldestJobMinutes: number | null;
  healthy: boolean;
}

export interface ProcessingMetricsSummary {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTimeMs: number;
  retryCount: number;
  errorRate: number;
}

export interface CostMetricsSummary {
  totalEstimatedCost: number;
  totalActualCost: number;
  costByProvider: Record<string, number>;
  dailyCost: number;
}

export interface MonitoringSummary {
  providerMetrics: ProviderMetricsSummary[];
  queueMetrics: QueueMetricsSummary;
  processingMetrics: ProcessingMetricsSummary;
  costMetrics: CostMetricsSummary;
  timestamp: string;
}

export class MonitoringService {
  private readonly config: AppConfig;
  private readonly metricsStore: Map<string, MetricsRecord[]> = new Map();

  constructor(config: AppConfig) {
    this.config = config;
  }

  async recordMetrics(metrics: ProcessingMetrics): Promise<void> {
    const timestamp = new Date().toISOString();

    const records: MetricsRecord[] = [
      { timestamp, metric: "processing_time_ms", value: metrics.totalDurationMs, labels: { orderId: metrics.orderId, itemId: metrics.itemId } },
      { timestamp, metric: "gpu_memory_mb", value: metrics.gpuMemoryMb, labels: { orderId: metrics.orderId, itemId: metrics.itemId } },
      { timestamp, metric: "cpu_percent", value: metrics.cpuPercent, labels: { orderId: metrics.orderId, itemId: metrics.itemId } },
      { timestamp, metric: "quality_before", value: metrics.qualityBefore, labels: { orderId: metrics.orderId, itemId: metrics.itemId } },
      { timestamp, metric: "quality_after", value: metrics.qualityAfter, labels: { orderId: metrics.orderId, itemId: metrics.itemId } },
      { timestamp, metric: "processing_success", value: metrics.success ? 1 : 0, labels: { orderId: metrics.orderId, itemId: metrics.itemId } },
    ];

    for (const [provider, cost] of Object.entries(metrics.providerCosts)) {
      records.push({
        timestamp,
        metric: "provider_cost",
        value: cost,
        labels: { orderId: metrics.orderId, itemId: metrics.itemId, provider },
      });
    }

    for (const [stage, duration] of Object.entries(metrics.stageDurations)) {
      records.push({
        timestamp,
        metric: `stage_${stage}_ms`,
        value: duration,
        labels: { orderId: metrics.orderId, itemId: metrics.itemId, stage },
      });
    }

    for (const record of records) {
      const key = record.metric;
      if (!this.metricsStore.has(key)) {
        this.metricsStore.set(key, []);
      }
      const store = this.metricsStore.get(key)!;
      store.push(record);
      if (store.length > 1000) {
        store.shift();
      }
    }

    logger.info("Metrics recorded", {
      orderId: metrics.orderId,
      itemId: metrics.itemId,
      totalDurationMs: metrics.totalDurationMs,
      success: metrics.success,
    });
  }

  async queryMetrics(query: MetricsQuery): Promise<MetricsRecord[]> {
    let results: MetricsRecord[] = [];

    if (query.metricName) {
      const store = this.metricsStore.get(query.metricName);
      if (store) {
        results = [...store];
      }
    } else {
      for (const store of this.metricsStore.values()) {
        results.push(...store);
      }
    }

    if (query.fromTime) {
      results = results.filter((r) => r.timestamp >= query.fromTime!);
    }
    if (query.toTime) {
      results = results.filter((r) => r.timestamp <= query.toTime!);
    }

    results.sort((a, b) => {
      if (query.orderBy === "asc") return a.timestamp.localeCompare(b.timestamp);
      return b.timestamp.localeCompare(a.timestamp);
    });

    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  async getProviderMetricsSummary(): Promise<ProviderMetricsSummary[]> {
    const collector = new ProviderMetricsCollector();
    const allMetrics = collector.getAllMetrics();

    return allMetrics.map((m) => ({
      providerName: m.providerName,
      totalRequests: m.totalRequests,
      successfulRequests: m.successfulRequests,
      failedRequests: m.failedRequests,
      averageLatencyMs: m.totalRequests > 0 ? Math.round(m.totalLatencyMs / m.totalRequests) : 0,
      totalCost: Math.round(m.totalCost * 10000) / 10000,
      errorRate: m.totalRequests > 0 ? Math.round((m.failedRequests / m.totalRequests) * 100) : 0,
      lastError: m.lastError,
      lastErrorAt: m.lastErrorAt,
    }));
  }

  async getQueueMetricsSummary(): Promise<QueueMetricsSummary> {
    const [queuedJobs, retryingJobs, deadLetterJobs, runningJobs] = await Promise.all([
      prisma.processingJob.count({ where: { status: "QUEUED" } }),
      prisma.processingJob.count({ where: { status: "RETRYING" } }),
      prisma.processingJob.count({ where: { status: "DEAD_LETTER" } }),
      prisma.processingJob.count({ where: { status: "RUNNING" } }),
    ]);

    const oldestJob = await prisma.processingJob.findFirst({
      where: { status: { in: ["QUEUED", "RETRYING"] } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });

    const oldestJobMinutes = oldestJob
      ? Math.round((Date.now() - oldestJob.createdAt.getTime()) / 60000)
      : null;

    return {
      queueDepth: queuedJobs + retryingJobs,
      activeWorkers: runningJobs,
      queuedJobs,
      retryingJobs,
      deadLetterJobs,
      oldestJobMinutes,
      healthy: (queuedJobs + retryingJobs) < 100,
    };
  }

  async getProcessingMetricsSummary(hoursBack = 24): Promise<ProcessingMetricsSummary> {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const [totalJobs, completedJobs, failedJobs, retryAggregate, avgDuration] = await Promise.all([
      prisma.processingJob.count({ where: { createdAt: { gte: since } } }),
      prisma.processingJob.count({ where: { status: "COMPLETED", createdAt: { gte: since } } }),
      prisma.processingJob.count({ where: { status: "FAILED", createdAt: { gte: since } } }),
      prisma.processingJob.aggregate({
        _sum: { attempts: true },
        where: { createdAt: { gte: since }, attempts: { gt: 1 } },
      }),
      prisma.processingJob.aggregate({
        _avg: { gpuSecondsSpent: true },
        where: { status: { in: ["COMPLETED", "FAILED"] }, createdAt: { gte: since }, gpuSecondsSpent: { gt: 0 } },
      }),
    ]);

    const retryCount = retryAggregate._sum.attempts || 0;
    const averageProcessingTimeMs = Math.round((avgDuration._avg.gpuSecondsSpent || 0) * 1000);
    const errorRate = totalJobs > 0 ? Math.round((failedJobs / totalJobs) * 100) : 0;

    return {
      totalJobs,
      completedJobs,
      failedJobs,
      averageProcessingTimeMs,
      retryCount,
      errorRate,
    };
  }

  async getCostMetricsSummary(hoursBack = 24): Promise<CostMetricsSummary> {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const [providerBreakdown, dailyCost] = await Promise.all([
      prisma.providerCostLog.groupBy({
        by: ["provider"],
        where: { createdAt: { gte: since } },
        _sum: { estimatedCost: true, actualCost: true },
      }),
      prisma.providerCostLog.aggregate({
        _sum: { estimatedCost: true, actualCost: true },
        where: { createdAt: { gte: since } },
      }),
    ]);

    const costByProvider: Record<string, number> = {};
    let totalEstimatedCost = 0;
    let totalActualCost = 0;

    for (const row of providerBreakdown) {
      const est = Number(row._sum.estimatedCost || 0);
      const act = Number(row._sum.actualCost || 0);
      costByProvider[row.provider] = est;
      totalEstimatedCost += est;
      totalActualCost += act;
    }

    return {
      totalEstimatedCost,
      totalActualCost,
      costByProvider,
      dailyCost: Number(dailyCost._sum.estimatedCost || 0),
    };
  }

  async getFullMonitoringSummary(): Promise<MonitoringSummary> {
    const [providerMetrics, queueMetrics, processingMetrics, costMetrics] = await Promise.all([
      this.getProviderMetricsSummary(),
      this.getQueueMetricsSummary(),
      this.getProcessingMetricsSummary(),
      this.getCostMetricsSummary(),
    ]);

    return {
      providerMetrics,
      queueMetrics,
      processingMetrics,
      costMetrics,
      timestamp: new Date().toISOString(),
    };
  }
}
