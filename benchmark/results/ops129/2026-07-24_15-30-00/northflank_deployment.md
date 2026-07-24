# OPS-129 — Northflank Deployment

**Date:** 2026-07-24

## Production Platform

The production API runs on **Northflank** (Docker container platform). A legacy Cloud Run service also exists but receives no traffic.

**Northflank config** (from `northflank.json`):
- Service: `ai-photo-studio-api`
- Image source: GitHub → GHCR → `ghcr.io/ai-photo-studio/ai-photo-studio/ai-api`
- Auto-deploy: ✅ Enabled (GitHub integration)
- Custom domain: `api.thannow.com`
- Health check: `GET /api/health` (port 8080, 30s interval)

## Dockerfile Fix (OPS-129)

The Dockerfile had a critical bug that prevented ALL production deployments for days:

| Problem | Fix |
|---------|-----|
| Inline `package.json` missing `sharp` and other dependencies | Now copies `apps/api/package.json` directly from repo |
| Multi-stage build with incorrect layer caching | Simplified to single-stage build |
| `tsc` command path not found | Changed WORKDIR so `npx tsc` runs directly |
| `node_modules` not found in copy stage | Single-stage avoids cross-stage copy |

**Deployment pipeline fix history (4 iterations):**
1. `8165426` — First attempt: use real package.json but wrong WORKDIR (`tsc` not found)
2. `965227e` — Second attempt: use correct paths but missing `sharp` module (TypeScript errors)
3. `71a2c9e` — Third attempt: multi-stage build with explicit `sharp` install (`node_modules` cache miss)
4. `204a926` — **Final fix**: single-stage build, copy `package.json` from repo, `npx tsc` works

## Build Result

| Job | Duration | Status |
|-----|----------|--------|
| Verify | 33s | ✅ PASS |
| Build & Push API Image | 1m51s | ✅ PASS |
| Trigger Northflank Deploy | 3s | ✅ TRIGGERED |
| Deploy Frontend | 18s | ❌ FAILED (Node.js v20 deprecation, separate issue) |

## Current API Revision

Still awaiting Northflank deploy completion (auto-deploy can take 2-5 minutes after image push).

## Admin Bootstrap Requirement

To create the admin user, the following env vars must be set on the Northflank service:
```
ADMIN_BOOTSTRAP_EMAIL=nazimsaeed@gmail.com
ADMIN_BOOTSTRAP_PASSWORD=Lahore!23
```

The `bootstrapFirstAdmin()` method in `admin-auth.service.ts` runs on every API startup and creates the admin user if these env vars are present.
