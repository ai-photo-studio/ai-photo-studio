# MASTER_PLATFORM_ROLLBACK.md

## Status: Phase 1 - Google Cloud Foundation (In Progress)

Generated: 2026-06-30T12:30:00+05:00

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

### Remaining
- SA key creation blocked by org policy (using Workload Identity instead)
- Cloud Run deployment pending GitHub + Cloudflare blockers

## Phase 2: Git Migration - PARTIAL

- gh CLI authenticated as `ai-photo-studio`
- Repo `ai-photo-studio/ai-photo-studio` EXISTS
- Remote still points to old repo: https://github.com/gardenshop/ai-photo-studio-whatsapp.git
- Requires admin:org scope (new device code needed)

## Phase 3: Cloudflare Migration - BLOCKED

- Target account: Wpaistudio@gmail.com (Account ID: 2eb5eadd4af6da3d3a5f6c61d92437e4)
- wrangler is authenticated as `gisupp@gmail.com` (Account ID: 85f6a6181b4653c2a45e69cb7ce8a474)
- Target Pages project `ai-photo-studio` does not exist
- Target R2 bucket `ai-photo-studio-storage` does not exist
- Requires: API token from Wpaistudio@gmail.com (Pages-Edit + R2-Edit)

## Phase 2.0: Deployment Preparation - IN PROGRESS

### Completed
- Dockerfile created (multi-stage Node.js build)
- cloudbuild.yaml created
- service.yaml created (Cloud Run service config)
- deploy-cloudrun.sh created
- deploy-cloudrun.ps1 created
- DEPLOYMENT_PREPARATION.md created
- SECRET_MAPPING.md created
- Secret inventory documented
- Artifact Registry configuration documented
- Cloud SQL migration plan documented
- Railway rollback readiness documented

### Blocked
- No deployment until billing enabled
- No database migration until billing enabled

## Phase 5: Validation - NOT STARTED

## Phase 6: Traffic Switch - NOT STARTED

## Phase 7: Railway Retirement - NOT STARTED

Railway remains online. No deletion.

## Verification Status

| Check | Status |
|-------|--------|
| npm run build | PASS |
| npm run typecheck | PASS |
| npm run enterprise-verify | PASS |
| railway status | PASS |
| railway variables | EXPORTED |
| wrangler whoami | WRONG ACCOUNT (gisupp@gmail.com) |
| gcloud version | PASS (574.0.0, D:\Programs\GoogleCloudSDK\google-cloud-sdk\bin) |
| gcloud auth list | PASS (wpaistudio@gmail.com) |
| gcloud config list | PASS (project = project-9540c255-c960-4fa0-a91) |
| gcloud sql instances list | PASS (ai-photo-studio-db RUNNABLE) |
| gcloud redis instances list | PASS (ai-photo-studio-redis) |
| gcloud secrets list | PASS (7 secrets) |
| gh auth status | PARTIAL (ai-photo-studio account, missing admin:org) |

## Blockers

1. **GitHub admin:org** — generate new device code: `gh auth refresh -h github.com -s admin:org`
2. **Cloudflare account switch** — replace CLOUDFLARE_API_TOKEN with Wpaistudio@gmail.com token (Pages-Edit + R2-Edit)
3. **Git remote** — update after GitHub admin:org is granted

## Deliverables

- Google Cloud SDK: Installed on D drive (v574.0.0)
- Google authentication: COMPLETE (wpaistudio@gmail.com)
- GCP project: project-9540c255-c960-4fa0-a91 (billing linked)
- APIs enabled: ALL required
- Artifact Registry: CREATED (ai-photo-studio-api)
- Cloud SQL: CREATED (ai-photo-studio-db)
- Memorystore Redis: CREATED (ai-photo-studio-redis)
- Secret Manager: 7 secrets created
- Workload Identity: CONFIGURED
- Deployment files: PREPARED
- GitHub migration: PARTIAL (auth done, remote not updated)
- Cloudflare migration: BLOCKED (account not switched)
- Railway status: ONLINE (linked, variables exported)
- Updated completion: Phase 2.2 at 60%, Overall ~48%

<environment_details>
- Current time: 2026-06-29T23:30:00+05:00
- Working directory: D:\AI Product Photo Studio on WhatsApp
- Workspace root folder: D:\AI Product Photo Studio on WhatsApp
</environment_details>
