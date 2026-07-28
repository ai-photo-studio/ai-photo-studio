# OPS-125 — Beta Launch Checklist

**Date:** 2026-07-24

## Pre-Launch

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Cloudflare Pages deployed (latest commit) | VERIFIED | `fe5c2301`, commit `2ee036e` |
| 2 | Frontend build passes | VERIFIED | typecheck + build PASS |
| 3 | API health endpoint responds | VERIFIED | api.thannow.com: `{"success":true}` |
| 4 | Auth middleware active on all routes | VERIFIED | requireAuth + requireAdminAuth |
| 5 | Rate limiting configured | VERIFIED | 120 req/min global + per-endpoint |
| 6 | CORS configured | VERIFIED | ALLOWED_ORIGINS=thannow.com |
| 7 | JWT signing configured | VERIFIED | JWT_SECRET + ADMIN_JWT_SECRET |
| 8 | Payment provider configured | VERIFIED | PAYMENT_GATEWAY_NAME=manual (Beta) |
| 9 | Business analytics endpoint | VERIFIED | `GET /admin/business-metrics` |
| 10 | Admin dashboard shows business metrics | VERIFIED | Revenue, conversion, cost, margin, queue, storage |

## Analytics & Monitoring

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 11 | Daily uploads tracked | VERIFIED | OrderImage.kind=ORIGINAL |
| 12 | Paid orders tracked | VERIFIED | Payment.status=PAID |
| 13 | Conversion rate computed | VERIFIED | Paid / Total Restore Items |
| 14 | Revenue PKR/USD tracked | VERIFIED | Payment.amount by currency |
| 15 | Replicate cost tracked | VERIFIED | ProviderCostLog.provider=flux-restore |
| 16 | Gross margin computed | VERIFIED | (Revenue - Cost) / Revenue |
| 17 | Queue monitored | VERIFIED | ProcessingJob status breakdown |
| 18 | Storage tracked | VERIFIED | OrderImage kind distribution |
| 19 | Restore failures tracked | VERIFIED | RestorationItem.status=FAILED |
| 20 | Health endpoints | VERIFIED | /health, /monitoring/health, /admin/queue-health |

## Operations

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 21 | Watchdogs active | VERIFIED | Queue, worker, heartbeat, recovery, memory |
| 22 | Cleanup worker runs | VERIFIED | runCleanupOnce() on startup |
| 23 | Database backups | VERIFIED | Neon auto-daily |
| 24 | Secrets in env | VERIFIED | .env.project.example with placeholders |
| 25 | Structured logging | VERIFIED | JSON {level, message, time, meta} |

## Gaps for Beta

| # | Gap | Severity | Mitigation |
|---|-----|----------|------------|
| 26 | Customer feedback form | Low | Not wired; email support available via existing notification service |
| 27 | CSRF token mechanism | Low | Mitigated by Bearer token auth + CORS |
| 28 | External uptime monitoring | Medium | Manual check recommended; no Pingdom/UptimeRobot configured |
| 29 | Alerting (Slack/PagerDuty) | Low | Watchdogs self-recover; no external alert integration |
| 30 | Print fulfillment (shipping) | Medium | Scaffolding defined; requires courier API integration |