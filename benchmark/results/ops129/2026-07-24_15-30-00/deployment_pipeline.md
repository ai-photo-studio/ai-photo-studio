# OPS-129 — Deployment Pipeline Report

**Date:** 2026-07-24

## Pipeline Overview

The deployment pipeline has three components:
1. **GitHub Actions** (`.github/workflows/deploy.yml`) — Build Docker image + push to GHCR
2. **Northflank** — Auto-deploys from GHCR when main branch updates
3. **Cloudflare Pages** — Static frontend hosting

## GitHub Actions Failure History

| Run | Date | Duration | Failure Reason |
|-----|------|----------|---------------|
| 30086471192 | 2026-07-24 | 1m51s Docker build ✅ | Frontend step failed (Node v20) |
| 30086644690 | 2026-07-24 | 1m51s Docker build ✅ | Frontend step failed (Node v20) |
| 30085134360 | 2026-07-24 | 47s | `sharp` module not found (Dockerfile bug) |
| 30085945781 | 2026-07-24 | 49s | `tsc` not found (Dockerfile WORKDIR bug) |
| 30084965600 | 2026-07-24 | 47s | `sharp` not found / Docker Hub timeout |
| 29808389964 | 2026-07-21 | 46s | Same `sharp` error |
| 29784769152 | 2026-07-20 | 48s | Same `sharp` error |
| 29781236249 | 2026-07-20 | 48s | Same `sharp` error |

**Root cause of all API build failures**: The Dockerfile had a hardcoded inline `package.json` that didn't include `sharp` or other dependencies needed by benchmark scripts. The fix was to use the actual `apps/api/package.json` from the repo.

## Current Pipeline Status

| Step | Status | Detail |
|------|--------|--------|
| Verify (typecheck + lint) | ✅ PASS | Completes in ~33s |
| Docker build | ✅ PASS | Multi-stage, 1m51s |
| Push to GHCR | ✅ PASS | Tags: `latest`, `sha-204a926` |
| Trigger Northflank deploy | ✅ TRIGGERED | GitHub integration activated |
| Deploy frontend (Cloudflare) | ❌ FAILED | Node.js v20 setup action deprecated (manual wrangler deploy works) |
| Post-deploy verification | ⏳ NOT RUN | Requires Northflank deploy to complete |

## Frontend Deploy Note

The frontend deploy step in GitHub Actions fails because the `actions/setup-node@v4` action uses Node.js 20 which is deprecated on the ubuntu-24 runner. However, the frontend was deployed successfully via manual `wrangler pages deploy` (deployment ID 855ba961, commit 204a926).

## Fix Applied

Modified `Dockerfile` to:
1. Use the real `apps/api/package.json` instead of inline stub
2. Install `sharp` explicitly for benchmark script TypeScript compilation
3. Use single-stage build to avoid layer caching issues
4. Run `npx tsc` directly from the correct WORKDIR
