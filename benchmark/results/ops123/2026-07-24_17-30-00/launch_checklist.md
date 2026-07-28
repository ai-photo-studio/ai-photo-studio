# OPS-123 — Launch Checklist

**Date:** 2026-07-24

## Pre-Launch Checks

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Frontend build passes | ✅ VERIFIED | typecheck + build PASS |
| 2 | Backend typecheck passes | ✅ VERIFIED | tsc --noEmit clean |
| 3 | API health endpoint responds | ✅ VERIFIED | GET /api/health |
| 4 | Rate limiting active | ✅ VERIFIED | Global + per-endpoint |
| 5 | CORS configured | ✅ VERIFIED | ALLOWED_ORIGINS configurable |
| 6 | Auth middleware on all routes | ✅ VERIFIED | requireAuth on customer, requireAdminAuth on admin |
| 7 | JWT signing configured | ✅ VERIFIED | JWT_SECRET required in env |
| 8 | Admin JWT configured | ✅ VERIFIED | ADMIN_JWT_SECRET required |
| 9 | Payment provider configured | ✅ VERIFIED | PAYMENT_GATEWAY_NAME in env |
| 10 | Database migrations run | ✅ VERIFIED | prisma migrate deploy on startup |
| 11 | Storage provider configured | ✅ VERIFIED | R2 credentials configured |
| 12 | Storage lifecycle set | ✅ VERIFIED | Originals: 72h, Finals: 30d, Previews: 7d, Artifacts: 24h |
| 13 | Cleanup worker active | ✅ VERIFIED | runCleanupOnce on startup |
| 14 | Structured logging | ✅ VERIFIED | JSON log output |
| 15 | Signed download URLs | ✅ VERIFIED | 15-min expiry via AWS presigner |

## Post-Launch Checks

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 16 | Cloudflare Pages deployed | ❓ UNKNOWN | Requires dashboard |
| 17 | Live commerce workflow | ❓ UNKNOWN | Requires browser |
| 18 | Payment webhook reachable | ❓ UNKNOWN | Requires provider URL |
| 19 | Print fulfillment integration | ❓ UNKNOWN | Scaffolding only |
| 20 | CDN cache headers | ❓ UNKNOWN | Requires live site |
