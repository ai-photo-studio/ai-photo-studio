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
- Background remover service deployment in progress (Python service requires 4Gi memory)

**Environment Variables:**
- `AI_PROVIDER=mock` (configured in Cloud Run)
- `BACKGROUND_API_URL` - not required for mock provider

## Phase P Note

WhatsApp environment variables are set in Railway production, webhook verification passes, delivery payload generation passes, and Meta connectivity still requires resolution before switching away from `LOG_ONLY`.

## Phase Q Note

WhatsApp is deferred to Phase 2 for launch planning. Keep `DELIVERY_MODE=LOG_ONLY` and do not let Meta connectivity block the web-first customer launch.

## AI Agent Instructions

See `AI_PROJECT_RULES.md` for the mandatory agent rules.
