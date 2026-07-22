import type { AppConfig } from "../config/env";
import { prisma } from "../db/prisma";
import { StorageService } from "./storage.service";
import { QueueHealthService } from "./queue-health.service";
import { QueueMetricsService } from "./queue-metrics.service";
import { MonitoringService } from "./monitoring.service";
import { ProviderFactory } from "../restoration-providers/factory/ProviderFactory";
import { ProviderCertifier } from "../restoration-providers/certification/ProviderCertifier";
import { logger } from "../utils/logger";

export interface ProviderHealthSummary {
  providerName: string;
  status: "active" | "degraded" | "down";
  latency: number;
  errorRate: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  certified: boolean;
  lastChecked: string;
}

export interface QueueHealthSummary {
  healthy: boolean;
  queueDepth: number;
  activeWorkers: number;
  queuedJobs: number;
  retryingJobs: number;
  deadLetterJobs: number;
  oldestJobMinutes: number | null;
  queueName: string;
}

export interface StorageHealthSummary {
  healthy: boolean;
  provider: string;
  dryRun: boolean;
  canUpload: boolean;
  canDownload: boolean;
  canDelete: boolean;
  error: string | null;
}

export interface RedisHealthSummary {
  healthy: boolean;
  connected: boolean;
  dryRun: boolean;
  error: string | null;
}

export interface DatabaseHealthSummary {
  healthy: boolean;
  connected: boolean;
  error: string | null;
}

export interface HealthDashboardSummary {
  timestamp: string;
  overall: "healthy" | "degraded" | "down";
  providers: ProviderHealthSummary[];
  queue: QueueHealthSummary;
  storage: StorageHealthSummary;
  redis: RedisHealthSummary;
  database: DatabaseHealthSummary;
}

export class HealthDashboardService {
  private readonly config: AppConfig;
  private readonly storage: StorageService;
  private readonly queueHealth: QueueHealthService;
  private readonly queueMetrics: QueueMetricsService;
  private readonly monitoring: MonitoringService;

  constructor(config: AppConfig) {
    this.config = config;
    this.storage = new StorageService(config);
    this.queueHealth = new QueueHealthService(config);
    this.queueMetrics = new QueueMetricsService();
    this.monitoring = new MonitoringService(config);
  }

  async getProviderHealth(): Promise<ProviderHealthSummary[]> {
    const factory = new ProviderFactory(this.config);
    const certifier = new ProviderCertifier();

    const providerNames = ["replicate", "openai", "fal-ai", "runpod", "mock"];
    const summaries: ProviderHealthSummary[] = [];

    for (const name of providerNames) {
      try {
        const provider = factory.create(name);
        certifier.registerProvider(provider);

        const health = await provider.health();
        const cred = await certifier.verifyCredentials(name);

        summaries.push({
          providerName: name,
          status: health.status,
          latency: health.latency,
          errorRate: health.errorRate,
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          certified: cred.found && health.status === "active",
          lastChecked: health.lastChecked,
        });
      } catch (err) {
        summaries.push({
          providerName: name,
          status: "down",
          latency: 0,
          errorRate: 1,
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          certified: false,
          lastChecked: new Date().toISOString(),
        });
      }
    }

    const providerMetrics = await this.monitoring.getProviderMetricsSummary();
    for (const summary of summaries) {
      const metrics = providerMetrics.find((m) => m.providerName === summary.providerName);
      if (metrics) {
        summary.totalRequests = metrics.totalRequests;
        summary.successfulRequests = metrics.successfulRequests;
        summary.failedRequests = metrics.failedRequests;
      }
    }

    return summaries;
  }

  async getQueueHealth(): Promise<QueueHealthSummary> {
    const health = await this.queueHealth.inspectImageQueue();
    const metrics = await this.queueMetrics.getMetrics();
    const queueHealthResult = await this.queueMetrics.getQueueHealth();

    return {
      healthy: health.healthy && queueHealthResult.healthy,
      queueDepth: metrics.queueDepth,
      activeWorkers: metrics.activeWorkers,
      queuedJobs: metrics.queuedJobs,
      retryingJobs: metrics.retryingJobs,
      deadLetterJobs: metrics.deadLetterJobs,
      oldestJobMinutes: queueHealthResult.oldestJobMinutes,
      queueName: health.queueName,
    };
  }

  async getStorageHealth(): Promise<StorageHealthSummary> {
    const provider = this.config.storageDryRun ? "mock" : "r2";
    const result: StorageHealthSummary = {
      healthy: true,
      provider,
      dryRun: this.config.storageDryRun,
      canUpload: false,
      canDownload: false,
      canDelete: false,
      error: null,
    };

    try {
      const testKey = `health-check/${Date.now()}-test.txt`;
      const uploadResult = await this.storage.uploadFile({
        keyPrefix: "artifacts",
        fileName: "health-check-test.txt",
        body: Buffer.from("health check"),
        contentType: "text/plain",
      });
      result.canUpload = true;

      await this.storage.downloadFile(uploadResult.key);
      result.canDownload = true;

      await this.storage.deleteFile(uploadResult.key);
      result.canDelete = true;
    } catch (err) {
      result.healthy = false;
      result.error = err instanceof Error ? err.message : String(err);
    }

    return result;
  }

  async getRedisHealth(): Promise<RedisHealthSummary> {
    if (this.config.queueDryRun) {
      return {
        healthy: true,
        connected: false,
        dryRun: true,
        error: null,
      };
    }

    try {
      const { Queue } = await import("bullmq");
      const queue = new Queue("health-check", {
        connection: { url: this.config.REDIS_URL } as any,
      });

      await queue.add("ping", { timestamp: Date.now() });
      const counts = await queue.getJobCounts();
      await queue.close().catch(() => undefined);

      return {
        healthy: true,
        connected: true,
        dryRun: false,
        error: null,
      };
    } catch (err) {
      return {
        healthy: false,
        connected: false,
        dryRun: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async getDatabaseHealth(): Promise<DatabaseHealthSummary> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        healthy: true,
        connected: true,
        error: null,
      };
    } catch (err) {
      return {
        healthy: false,
        connected: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async getFullHealthSummary(): Promise<HealthDashboardSummary> {
    const [providers, queue, storage, redis, database] = await Promise.all([
      this.getProviderHealth(),
      this.getQueueHealth(),
      this.getStorageHealth(),
      this.getRedisHealth(),
      this.getDatabaseHealth(),
    ]);

    const allHealthy =
      providers.every((p) => p.status !== "down") &&
      queue.healthy &&
      storage.healthy &&
      redis.healthy &&
      database.healthy;

    const anyDown =
      providers.some((p) => p.status === "down") ||
      !queue.healthy ||
      !storage.healthy ||
      !redis.healthy ||
      !database.healthy;

    const overall = allHealthy ? "healthy" : anyDown ? "down" : "degraded";

    logger.info("Health dashboard summary generated", {
      overall,
      providers: providers.length,
      queueHealthy: queue.healthy,
      storageHealthy: storage.healthy,
      redisHealthy: redis.healthy,
      databaseHealthy: database.healthy,
    });

    return {
      timestamp: new Date().toISOString(),
      overall,
      providers,
      queue,
      storage,
      redis,
      database,
    };
  }
}
