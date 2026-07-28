# Monitoring Guide

## Overview

The Monitoring Service captures operational metrics across the restoration pipeline, enabling real-time observability and alerting.

## Monitored Metrics

| Metric | Source | Description |
|---|---|---|
| Provider latency | ProviderMetricsCollector | Average response time per provider |
| Queue depth | QueueMetricsService | Number of queued + retrying jobs |
| Processing time | ProcessingJob.gpuSecondsSpent | Average processing time per job |
| Provider failures | ProviderMetricsCollector | Failed requests per provider |
| Retry count | ProcessingJob.attempts | Number of retried jobs |
| Daily cost | ProviderCostLog | Estimated cost in last 24 hours |
| Daily jobs | ProcessingJob | Total jobs in last 24 hours |
| Error rate | ProcessingJob | Failed/total ratio |

## Monitoring Service

### Recording Metrics

```typescript
import { MonitoringService } from "./services/monitoring.service";

const monitoring = new MonitoringService(config);

await monitoring.recordMetrics({
  orderId: "order-123",
  itemId: "item-456",
  queueJobId: "job-789",
  totalDurationMs: 5000,
  stageDurations: { restoration: 3000, upscale: 2000 },
  gpuMemoryMb: 2048,
  cpuPercent: 45,
  providerCosts: { replicate: 0.0034 },
  qualityBefore: 45,
  qualityAfter: 85,
  success: true,
});
```

### Querying Metrics

```typescript
const results = await monitoring.queryMetrics({
  metricName: "processing_time_ms",
  fromTime: "2026-07-22T00:00:00Z",
  toTime: "2026-07-22T23:59:59Z",
  limit: 100,
  orderBy: "desc",
});
```

### Summary Reports

```typescript
// Provider metrics
const providerMetrics = await monitoring.getProviderMetricsSummary();

// Queue metrics
const queueMetrics = await monitoring.getQueueMetricsSummary();

// Processing metrics (24h)
const processingMetrics = await monitoring.getProcessingMetricsSummary(24);

// Cost metrics (24h)
const costMetrics = await monitoring.getCostMetricsSummary(24);

// Full summary
const summary = await monitoring.getFullMonitoringSummary();
```

## Health Dashboard Service

### Provider Health

Checks each provider's health endpoint and certification status:

```typescript
const dashboard = new HealthDashboardService(config);
const providerHealth = await dashboard.getProviderHealth();
// Returns: ProviderHealthSummary[]
```

### Queue Health

Checks queue depth, active workers, and oldest job:

```typescript
const queueHealth = await dashboard.getQueueHealth();
// Returns: QueueHealthSummary
```

### Storage Health

Tests upload, download, and delete operations:

```typescript
const storageHealth = await dashboard.getStorageHealth();
// Returns: StorageHealthSummary
```

### Redis Health

Tests Redis connectivity:

```typescript
const redisHealth = await dashboard.getRedisHealth();
// Returns: RedisHealthSummary
```

### Database Health

Tests Prisma database connectivity:

```typescript
const dbHealth = await dashboard.getDatabaseHealth();
// Returns: DatabaseHealthSummary
```

### Full Health Summary

```typescript
const summary = await dashboard.getFullHealthSummary();
// Returns: HealthDashboardSummary
```

## Alert Thresholds

| Metric | Warning Threshold | Critical Threshold |
|---|---|---|
| Queue depth | > 50 | > 100 |
| Error rate | > 5% | > 20% |
| Provider latency | > 10s | > 30s |
| Daily cost | > $50 | > $100 |
| Dead letter jobs | > 5 | > 20 |

## Integration Points

- **MonitoringController** — Exposes metrics via HTTP endpoints
- **ProviderRouter** — Records provider success/failure metrics
- **RestorationService** — Records processing metrics after each job
- **CleanupService** — Logs cleanup results
- **HealthDashboardService** — Aggregates all health checks

## Data Retention

- In-memory metrics store: 1000 records per metric
- Database metrics: retained via ProviderCostLog and ProcessingJob records
- No external metrics backend required (can be added later)
