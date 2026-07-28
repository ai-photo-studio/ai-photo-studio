# OPS-123 — Operations Checklist

**Date:** 2026-07-24

## Logging

| Check | Status | Location |
|-------|--------|----------|
| Structured JSON logs | ✅ VERIFIED | utils/logger.ts — `{level, message, time, meta}` |
| Log levels: info/warn/error | ✅ VERIFIED | info→stdout, error→stderr |
| Request ID tracking | ✅ VERIFIED | x-request-id captured in restoration provider logs |
| Provider cost logging | ✅ VERIFIED | ProviderCostLog model captures every API call |

## Error Handling

| Check | Status | Location |
|-------|--------|----------|
| AppError class | ✅ VERIFIED | utils/errors.ts — HTTP status + error code |
| Graceful 404 handling | ✅ VERIFIED | All services return AppError with NOT_FOUND codes |
| Graceful 400 handling | ✅ VERIFIED | Validation errors return 400 with detail |
| Graceful 500 handling | ✅ VERIFIED | Global catch returns 500 INTERNAL_ERROR |
| Async error wrapping | ✅ VERIFIED | Controllers use try/catch with handleError |

## Health Endpoints

| Check | Status | Location |
|-------|--------|----------|
| GET /api/health | ✅ VERIFIED | index.ts:84 — returns 200 OK |
| GET /api/monitoring/health | ✅ VERIFIED | monitoring.controller.ts — checks all providers |
| GET /admin/queue-health | ✅ VERIFIED | admin.routes.ts:42 |
| Provider health checks | ✅ VERIFIED | health() method on every provider |

## Watchdogs & Recovery

| Check | Status | Location |
|-------|--------|----------|
| Queue watchdog | ✅ VERIFIED | services/queue-watchdog.service.ts |
| Worker watchdog | ✅ VERIFIED | services/worker-watchdog.service.ts |
| Job heartbeat | ✅ VERIFIED | services/job-heartbeat.service.ts |
| Recovery watchdog | ✅ VERIFIED | services/recovery-watchdog.service.ts |
| Memory watchdog | ✅ VERIFIED | services/memory-watchdog.service.ts |

## Metrics

| Check | Status | Location |
|-------|--------|----------|
| Admin dashboard metrics | ✅ VERIFIED | admin.controller.ts — dashboard() |
| Processing metrics | ✅ VERIFIED | admin route: /admin/processing-metrics |
| Queue metrics | ✅ VERIFIED | admin route: /admin/queue-metrics |
| Cost metrics | ✅ VERIFIED | admin route: /admin/cost-metrics |
| Worker health state | ✅ VERIFIED | services/worker-health.service.ts |

## Retry Logic

| Check | Status | Location |
|-------|--------|----------|
| ProcessingJob maxAttempts=5 | ✅ VERIFIED | prisma schema ProcessingJob |
| Admin retry endpoints | ✅ VERIFIED | /admin/orders/:id/retry, /admin/jobs/:id/retry |
| Replicate rate limit retry | ✅ VERIFIED | ops scripts handle 429 retries |
| Queue dead letter handling | ✅ VERIFIED | DEAD_LETTER status after max attempts |

## Deploy Safety

| Check | Status | Detail |
|-------|--------|--------|
| Pre-push safety check | ✅ VERIFIED | Verifies GCP, Cloudflare, secrets before push |
| Prisma migration auto-apply | ✅ VERIFIED | prisma migrate deploy on startup |
| Environment validation | ✅ VERIFIED | Zod schema at bootstrap |
