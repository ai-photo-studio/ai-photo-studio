# Project Safety Lock - Final Production Grade

## Protected Scope Protocol v3.2.0

This repository has a mandatory protection system to prevent accidental operations against wrong targets.

### Protection Rules

1. Verify repository ID matches `ai-photo-studio/ai-photo-studio`.
2. Verify GCP project ID matches `project-9540c255-c960-4fa0-a91`.
3. Verify Cloudflare account ID and name match the locked identity.
4. Verify required secrets exist without printing them.
5. Ensure protected files exist.
6. Block migrations and schema changes unless the database lock is explicitly unlocked.
7. Run build and typecheck before push or deploy.
8. Require a fresh `AI_code_audit_report.md` after changes.
9. AI_PROVIDER must be configured - `BACKGROUND_API_URL` required for local providers.

### Protected Services

- Cloud Run API
- Cloud Run Jobs
- Cloud SQL
- Redis
- Cloudflare Pages
- Cloudflare R2

### Verification Files

`PROJECT_LOCK.json` contains the protection configuration.

### Verification Files

`PROJECT_LOCK.json` contains the protection configuration.

## Cloudflare Pages Deployment

- Frontend project: `ai-photo-studio-frontend`
- Production URL: `https://29105fb4.ai-photo-studio-frontend.pages.dev`
- Account: `2eb5eadd4af6da3d3a5f6c61d92437e4` (`Wpaistudio@gmail.com`)
- Separate from `hojaseeds`: do not modify, redeploy, relink, rename, or disturb
- Frontend API binding: production builds use the Cloud Run API

## CORS Restriction

The Cloud Run API returns `Access-Control-Allow-Origin: https://ai-photo-studio.pages.dev` for the dedicated frontend origin.
Keep `ALLOWED_ORIGINS` restricted to the dedicated Pages project and do not widen it without a deliberate launch decision.

## Phase 3.0 - Infrastructure Migration

Cloud Run is the production platform. Cloudflare Pages is production frontend.
Railway has been completely removed. Protected Scope Protocol v3.2.0 applies.

## Phase 3.1 - Cloud Run Foundation

- Artifact Registry: `ai-photo-studio-api` repository created
- Cloud SQL: `ai-photo-studio-db` (POSTGRES_16, db-perf-optimized-N-2)
- Memorystore Redis: `ai-photo-studio-redis` (BASIC, 1GB)
- Secret Manager: 7 secrets created/updated
- Workload Identity: Pool and provider configured
- Cloud Run API: `ai-photo-studio-api` deployed and running

## Phase 3.2 - Background Remover Configuration

**Status:** RESOLVED - Local AI pipeline deployed successfully.

**Resolution:** 
- Deployed `ai-photo-studio-bg-remover` Cloud Run service with u2netp model
- API configured with `AI_PROVIDER=local-rembg` and `BACKGROUND_API_URL`
- Successfully built and deployed Python container to Artifact Registry

**Environment Variables:**
- `AI_PROVIDER=local-rembg` (configured in Cloud Run API)
- `BACKGROUND_API_URL=https://ai-photo-studio-bg-remover-mp3arpoi2a-uc.a.run.app`

**Deployment Status:**
- API: `https://ai-photo-studio-api-mp3arpoi2a-uc.a.run.app` (deployed 2026-07-02)
- Background Remover: `https://ai-photo-studio-bg-remover-mp3arpoi2a-uc.a.run.app` (deployed 2026-07-02)

**Model:** u2netp (512MB RAM, 1-5s processing)

## Phase 3.8 - Cloud Run Jobs Implementation

**Architecture:**
Cloudflare Pages → Cloud Run API → Cloud Tasks → Cloud Run Job → Background Remover → R2 → Result

**Model Selection:**
- **u2netp** recommended for MVP: 512MB RAM, 1-3s latency, good quality
- BiRefNet: 2-4GB RAM, 5-15s latency, best quality (blocked by Cloud Run memory limits)
- Cloud Run Jobs: Serverless, no permanent VM, scales to zero

**Status:** Cloud Run Jobs configured, deployment pending memory optimization.

## Phase 3.3 - Real AI Background Removal (RESOLVED)

**Status:** RESOLVED - Deployed with u2netp model optimization.

**Resolution:**
- Used u2netp model instead of BiRefNet (512MB vs 2-4GB memory)
- Successfully deployed to Cloud Run service
- Container size: ~250MB with optimized dependencies

**Optimization Applied:**
- Alpine base image
- Pinned dependencies
- Single worker
- Health endpoint: `/health`

**Current Provider:** `local-rembg` with u2netp model (transparent PNG returned)

## Phase 3.5 - Local Open Source AI Verification

**Open Source AI Matrix:**

| Service | Model | Health | Memory | Status |
|---------|-------|--------|--------|--------|
| background-remover | rembg (u2netp) | HEALTHY | 512Mi | Deployed |
| yolo-detector | YOLOv8 | local | 512Mi | Ready |
| real-esrgan | ESRGAN | local | 512Mi | Ready |
| ic-light-lab | IC-Light | local | 1Gi | Ready |
| product-classifier | YOLOv8 | local | 512Mi | Ready |

**Resource Comparison (Background Remover):**
- Model: **u2netp** (deployed)
- Container size: ~250MB
- Memory: 512MB
- Startup time: 10-30s
- Status: **Production ready**

## Phase P Note

WhatsApp environment variables are set in Railway production, webhook verification passes, delivery payload generation passes, and Meta connectivity still requires resolution before switching away from `LOG_ONLY`.

## Phase Q Note

WhatsApp is deferred to Phase 2 for launch planning. Keep `DELIVERY_MODE=LOG_ONLY` and do not let Meta connectivity block the web-first customer launch.

## AI Agent Instructions

See `AI_PROJECT_RULES.md` for the mandatory agent rules.
