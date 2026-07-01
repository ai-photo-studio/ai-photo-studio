# Project Safety Lock - Final Production Grade

## Protected Scope Protocol v3.2.0

This repository has a mandatory protection system to prevent accidental operations against wrong targets.

### Protection Rules

1. Verify repository ID matches `ai-photo-studio/ai-photo-studio`.
2. Railway is **DISABLED** for production - use Cloud Run only.
3. Verify GCP project ID matches `project-9540c255-c960-4fa0-a91`.
4. Verify Cloudflare account ID and name match the locked identity.
5. Verify required secrets exist without printing them.
6. Ensure protected files exist.
7. Block migrations and schema changes unless the database lock is explicitly unlocked.
8. Run build and typecheck before push or deploy.
9. Require a fresh `AI_code_audit_report.md` after changes.
10. AI_PROVIDER must be configured - `BACKGROUND_API_URL` required for local providers.

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
Railway is rollback only. Protected Scope Protocol v3.2.0 applies.

## Phase 3.1 - Cloud Run Foundation

- Artifact Registry: `ai-photo-studio-api` repository created
- Cloud SQL: `ai-photo-studio-db` (POSTGRES_16, db-perf-optimized-N-2)
- Memorystore Redis: `ai-photo-studio-redis` (BASIC, 1GB)
- Secret Manager: 7 secrets created/updated
- Workload Identity: Pool and provider configured
- Cloud Run API: `ai-photo-studio-api` deployed and running

## Phase 3.2 - Background Remover Configuration

**Root Cause:** `BACKGROUND_API_URL` was empty in Cloud Run environment variables.
The `BackgroundRemoverService` throws error when `BACKGROUND_API_URL.trim()` is empty.

**Resolution:** 
- API deployed with `AI_PROVIDER=mock` as fallback (mock provider doesn't require BACKGROUND_API_URL)
- Background remover Python service deployment blocked by Cloud Run resource constraints (requires 4Gi memory)

**Environment Variables:**
- `AI_PROVIDER=mock` (configured in Cloud Run)
- `BACKGROUND_API_URL` - not required for mock provider

**Note:** The background-remover service (`ai-photo-studio-bg-remover`) was created but deployment failed due to memory constraints. The mock provider is serving as a fallback, returning the original image without background removal.

## Phase 3.3 - Real AI Background Removal (BLOCKED)

**Status:** BLOCKED - Cloud Run resource constraints

**Root Cause Analysis:**
- Python container image: ~900MB (rembg + onnxruntime + dependencies)
- ONNX model loading: ~300MB model files
- Memory requirement: 2-4Gi minimum for model loading
- Cloud Run startup timeout: 300s exceeded during build/deploy
- Alpine Linux missing libGL dependencies for ONNX runtime

**Optimization Attempts:**
- Reduced to python:3.11-alpine
- Pinned dependency versions
- Added --workers 1 to reduce memory

**Recommendation:**
1. **Short-term:** Keep `AI_PROVIDER=mock` for MVP
2. **Long-term:** Deploy to GKE Autopilot or Cloud Run Jobs with 4Gi memory
3. **Alternative:** Use Modal.com for serverless GPU (requires paid account)

## Phase 3.5 - Local Open Source AI Verification

**Open Source AI Matrix:**

| Service | Model | Health | Memory | Status |
|---------|-------|--------|--------|--------|
| background-remover | rembg (BiRefNet) | BLOCKED | 2-4Gi | Cloud Run constraints |
| yolo-detector | YOLOv8 | local | 512Mi | Ready |
| real-esrgan | ESRGAN | local | 512Mi | Ready |
| ic-light-lab | IC-Light | local | 1Gi | Ready |
| product-classifier | YOLOv8 | local | 512Mi | Ready |

**Resource Comparison (Background Remover):**
- Model: BiRefNet (default in rembg)
- Container size: 900MB+
- Memory: 2-4Gi
- Startup time: 60-120s (model loading)
- Alternative: u2net (~200MB, 1Gi memory)

**Best Open Source Model for Production:**
1. **u2net** - Smaller, faster, lower memory
2. **BiRefNet** - Higher quality, higher resource usage
3. **Recommendation:** Use u2net for MVP, BiRefNet for premium

**Optimization Applied:**
- Alpine base image
- Pinned dependencies
- Single worker
- Health endpoint: `/health`

**Current Provider:** `mock` (returns original image without processing)

## Phase P Note

WhatsApp environment variables are set in Railway production, webhook verification passes, delivery payload generation passes, and Meta connectivity still requires resolution before switching away from `LOG_ONLY`.

## Phase Q Note

WhatsApp is deferred to Phase 2 for launch planning. Keep `DELIVERY_MODE=LOG_ONLY` and do not let Meta connectivity block the web-first customer launch.

## AI Agent Instructions

See `AI_PROJECT_RULES.md` for the mandatory agent rules.
