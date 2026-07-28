# OPS-124 — Monitoring Checklist

**Date:** 2026-07-24

## Health Endpoints

| Endpoint | Status | Response | Verified |
|----------|--------|----------|----------|
| `GET /api/health` | ✅ ACTIVE | `{"success":true,"message":"AI Photo Studio API is running"}` | ✅ LIVE TEST |
| `GET /api/monitoring/health` | ✅ ACTIVE | Returns provider health statuses | ✅ CODE |
| `GET /admin/queue-health` | ✅ ACTIVE | Queue depth, worker counts | ✅ CODE |

## Structured Logging

| Check | Status | Detail |
|-------|--------|--------|
| JSON format | ✅ VERIFIED | `{level, message, time, meta}` via `JSON.stringify` |
| Log levels: info/warn/error | ✅ VERIFIED | info→console.log, error→console.error |
| Request ID tracking | ✅ VERIFIED | x-request-id captured in restoration provider logs |
| Provider cost logging | ✅ VERIFIED | ProviderCostLog via Prisma |
| Provider cost types | ✅ VERIFIED | RESTORATION_INPAINT, RESTORATION_FACE, RESTORATION_COLORIZE, RESTORATION_UPSCALE, RESTORATION_ANALYSIS |

## Watchdogs (Active on Startup)

| Name | File | Verified |
|------|------|----------|
| Queue watchdog | `services/queue-watchdog.service.ts` | ✅ |
| Worker watchdog | `services/worker-watchdog.service.ts` | ✅ |
| Job heartbeat | `services/job-heartbeat.service.ts` | ✅ |
| Recovery watchdog | `services/recovery-watchdog.service.ts` | ✅ |
| Memory watchdog | `services/memory-watchdog.service.ts` | ✅ |

## Metrics

| Metric | Endpoint | Verified |
|--------|----------|----------|
| Dashboard stats | `/admin/dashboard` — todayOrders, revenue, pending | ✅ |
| Processing metrics | `/admin/processing-metrics` | ✅ |
| Queue metrics | `/admin/queue-metrics` | ✅ |
| Cost metrics | `/admin/cost-metrics` | ✅ |
| Creative cost metrics | `/admin/creative-cost-metrics` | ✅ |

## Replicate API Monitoring

| Check | Status | Detail |
|-------|--------|--------|
| Provider health check | ✅ VERIFIED | `IRestorationProvider.health()` method on all providers |
| Rate limit detection | ✅ VERIFIED | Retry wrapper in benchmark scripts (429 detection) |
| Worker health state | ✅ VERIFIED | `setWorkerHealthState()` / `getWorkerHealthState()` |
| Pipeline failure logging | ✅ VERIFIED | `logger.error()` with itemId and errorMessage |

## Alerting

| Check | Status | Notes |
|-------|--------|-------|
| Alerting system | **UNKNOWN** | No alerting configuration found in code (PagerDuty/Slack/etc) |
| Health endpoint for external monitoring | ✅ VERIFIED | GET /api/health can be used with UptimeRobot/Pingdom |
| Watchdog self-recovery | ✅ VERIFIED | Queue, worker, memory watchdogs auto-restart on failure |
| Dead letter handling | ✅ VERIFIED | DEAD_LETTER status after maxAttempts=5 exceeded |

## Monitoring Gaps

| Gap | Severity | Recommendation |
|-----|----------|---------------|
| No external uptime monitoring | High | Configure UptimeRobot or Pingdom for `api.thannow.com` |
| No alerting integration | High | Add Slack/PagerDuty webhook to watchdogs |
| No error rate dashboard | Medium | Send structured logs to Cloudflare Logs / Grafana |
| No Replicate cost tracking | Medium | ProviderCostLog captures costs but no billing alert |
| No CPU/memory metrics | Medium | Cloud Run provides built-in metrics in GCP Console |
```