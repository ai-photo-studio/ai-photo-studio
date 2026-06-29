# MASTER_PLATFORM_ROLLBACK.md

## Status: Phase 1 - Google Cloud Foundation (In Progress)

Generated: 2026-06-30T00:56:00+05:00

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

## Phase 1: Google Cloud Foundation - PARTIAL

### Completed
- Google Cloud SDK 574.0.0 installed to D:\Programs\GoogleCloudSDK\google-cloud-sdk
- gcloud authenticated as wpaistudio@gmail.com
- Project `aistudio-ai-photo-studio` created and set as default
- APIs enabled: iam, logging, monitoring, sqladmin
- Deployment service account created: github-actions-deploy@aistudio-ai-photo-studio.iam.gserviceaccount.com
- Deployment files prepared: Dockerfile, cloudbuild.yaml, service.yaml, deploy scripts

### Blocked
- Billing not linked (blocks remaining APIs: run, cloudbuild, artifactregistry, compute, secretmanager, containerregistry)
- IAM roles not granted (requires billing)
- Service account key not generated (requires billing)

## Phase 2: Git Migration - PARTIAL

- gh CLI authenticated as `ai-photo-studio`
- Repo `ai-photo-studio/ai-photo-studio` EXISTS
- Remote still points to old repo: https://github.com/gardenshop/ai-photo-studio-whatsapp.git
- Requires admin:org scope (device code D43A-D8E6 at https://github.com/login/device)

## Phase 3: Cloudflare Migration - BLOCKED

- Target account: Wpaistudio@gmail.com (Account ID: 2eb5eadd4af6da3d3a5f6c61d92437e4)
- wrangler authenticated as `gisupp@gmail.com` (Account ID: 85f6a6181b4653c2a45e69cb7ce8a474)
- Target Pages project `ai-photo-studio` does not exist
- Target R2 bucket `ai-photo-studio-storage` does not exist
- Requires: `wrangler login` with Wpaistudio@gmail.com account

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
| wrangler whoami | CONFIGURED (gisupp@gmail.com - wrong account) |
| gcloud version | PASS (574.0.0, D:\Programs\GoogleCloudSDK\google-cloud-sdk\bin) |
| gcloud auth list | PASS (wpaistudio@gmail.com) |
| gcloud config list | PASS (project = aistudio-ai-photo-studio) |
| gh auth status | PARTIAL (ai-photo-studio account, missing admin:org) |

## Blockers

1. **Google Cloud billing** — link account to enable remaining APIs and IAM roles
   - URL: https://console.cloud.google.com/billing/linkedaccount?project=aistudio-ai-photo-studio
2. **GitHub admin:org** — complete device flow at https://github.com/login/device (code D43A-D8E6)
3. **Cloudflare account switch** — `wrangler logout` then `wrangler login` as Wpaistudio@gmail.com

## Deliverables

- Google Cloud SDK: Installed on D drive (v574.0.0)
- Google authentication: COMPLETE (wpaistudio@gmail.com)
- AIStudio project: CREATED (aistudio-ai-photo-studio)
- Deployment files: PREPARED (Dockerfile, cloudbuild.yaml, service.yaml, deploy scripts)
- Secret mapping: DOCUMENTED (SECRET_MAPPING.md)
- Cloud SQL migration plan: DOCUMENTED (DEPLOYMENT_PREPARATION.md)
- GitHub migration: PARTIAL (auth done, remote not updated)
- Cloudflare migration: BLOCKED (account not switched)
- Railway status: ONLINE (linked, variables exported)
- Updated completion: Phase 2.0 at 75%, Overall ~35%

<environment_details>
- Current time: 2026-06-29T23:30:00+05:00
- Working directory: D:\AI Product Photo Studio on WhatsApp
- Workspace root folder: D:\AI Product Photo Studio on WhatsApp
</environment_details>
