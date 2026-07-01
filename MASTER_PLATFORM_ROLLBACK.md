# MASTER_PLATFORM_ROLLBACK.md

## Status: Phase 3 - Cloudflare Migration (Blocked)

Generated: 2026-06-30T18:30:00+05:00

## Target Platform

- Frontend: Cloudflare Pages
- Storage: Cloudflare R2
- Backend: Google Cloud Run
- Database: Cloud SQL PostgreSQL
- Cache: Memorystore Redis
- Secrets: Secret Manager
- Container Images: Artifact Registry
- Monitoring: Cloud Logging, Cloud Monitoring

## Phase 0: Inventory - COMPLETE

- Railway services, variables, domains, databases, Redis inventoried
- Cloudflare Pages and R2 inventoried
- No deletion performed
- Environment variables and deployment settings exported

## Phase 1: Google Cloud Foundation - COMPLETE

### Completed
- Google Cloud SDK 574.0.0 installed to D:\Programs\GoogleCloudSDK\google-cloud-sdk
- gcloud authenticated as wpaistudio@gmail.com
- Project `project-9540c255-c960-4fa0-a91` created and billing linked
- APIs enabled: ALL (run, cloudbuild, artifactregistry, compute, secretmanager, containerregistry, iam, logging, monitoring, sqladmin, redis, iamcredentials)
- Deployment service account created: github-actions-deploy@project-9540c255-c960-4fa0-a91.iam.gserviceaccount.com
- IAM roles granted: run.admin, artifactregistry.admin, cloudsql.client, secretmanager.secretAccessor
- Workload Identity configured: pool github-pool, provider github-provider
- Artifact Registry created: ai-photo-studio-api (us-central1)
- Cloud SQL created: ai-photo-studio-db (POSTGRES_16, db-perf-optimized-N-2, 136.115.21.123)
- Memorystore Redis created: ai-photo-studio-redis (10.74.177.27:6379)
- Secret Manager: 7 secrets created

## Phase 2: Git Migration - COMPLETE

- gh CLI authenticated as `ai-photo-studio` with `admin:org`
- Repo `ai-photo-studio/ai-photo-studio` EXISTS
- Remote UPDATED to `https://github.com/ai-photo-studio/ai-photo-studio.git`

## Phase 3: Cloudflare Migration - BLOCKED

- Target account: Wpaistudio@gmail.com (Account ID: 2eb5eadd4af6da3d3a5f6c61d92437e4)
- wrangler authenticated as `Wpaistudio@gmail.com` ✓
- **ISSUE:** User API Token (`cfut_...`) routes Pages/R2 API calls to OLD account
- Target Pages project `ai-photo-studio`: DOES NOT EXIST
- Target R2 bucket `ai-photo-studio-storage`: EXISTS
- **BLOCKER:** Requires Cloudflare Account API Token (not User API Token)

## Phase 2.0: Deployment Preparation - COMPLETE

### Completed
- Dockerfile created (multi-stage Node.js build)
- cloudbuild.yaml created
- service.yaml created (Cloud Run service config)
- deploy-cloudrun.ps1 created
- DEPLOYMENT_PREPARATION.md created
- SECRET_MAPPING.md created
- Secret inventory documented
- Artifact Registry configuration documented
- Cloud SQL migration plan documented
- Railway rollback readiness documented

## Phase 4: Cloud Run Deployment - BLOCKED

- Blocked by Cloudflare Account API Token requirement

## Phase 5: Cloudflare Pages Deployment - BLOCKED

- Blocked by Cloudflare Account API Token requirement

## Phase 6: Validation - NOT STARTED

## Phase 7: Railway Retirement - NOT STARTED

Railway remains online. No deletion.

## Verification Status

| Check | Status |
|-------|--------|
| npm run build | PASS |
| npm run typecheck | PASS |
| gcloud auth list | PASS (wpaistudio@gmail.com) |
| gcloud config list | PASS (project = project-9540c255-c960-4fa0-a91) |
| gcloud sql instances list | PASS (ai-photo-studio-db RUNNABLE) |
| gcloud redis instances list | PASS (ai-photo-studio-redis) |
| gcloud secrets list | PASS (7 secrets) |
| gh auth status | PASS (ai-photo-studio, admin:org) |
| wrangler whoami | PASS (Wpaistudio@gmail.com) |
| wrangler pages project list | FAIL (User API Token routes to wrong account) |
| wrangler r2 bucket list | FAIL (User API Token routes to wrong account) |

## Blockers

1. **Cloudflare Account API Token** — create token at https://dash.cloudflare.com/profile/api-tokens with:
   - Account → All Accounts → Cloudflare Pages — Edit
   - Account → All Accounts → R2 — Edit
   - Account → All Accounts → Account — Read
   - Export as `CLOUDFLARE_API_TOKEN`

2. **Git remote** — Already updated to `https://github.com/ai-photo-studio/ai-photo-studio.git`

## Deliverables

- Google Cloud SDK: Installed on D drive (v574.0.0)
- Google authentication: COMPLETE (wpaistudio@gmail.com)
- GCP project: project-9540c255-c960-4fa0-a91 (billing linked)
- APIs enabled: ALL required
- Artifact Registry: CREATED (ai-photo-studio-api)
- Cloud SQL: CREATED (ai-photo-studio-db, POSTGRES_16)
- Memorystore Redis: CREATED (ai-photo-studio-redis)
- Secret Manager: 7 secrets created
- Workload Identity: CONFIGURED
- Deployment files: READY
- GitHub migration: COMPLETE
- Cloudflare migration: BLOCKED (needs Account API Token)
- Railway status: ONLINE
- Updated completion: Phase 3 BLOCKED, Overall ~60%