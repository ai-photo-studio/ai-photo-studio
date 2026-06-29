# Google Cloud Deployment Preparation

## Phase 2.0 — Deployment Files and Configuration

Generated: 2026-06-30

## Deployment Files

### Dockerfile
- Multi-stage Node.js build
- Exposes port 3000
- Non-root user (node)
- Health check on /api/health

### cloudbuild.yaml
- Builds Docker image
- Pushes to Artifact Registry
- Deploys to Cloud Run
- Substitutions: PROJECT_ID, SERVICE_NAME, REGION, IMAGE_TAG

### service.yaml
- Cloud Run service definition
- Environment variables from Secret Manager
- Cloud SQL connection
- Autoscaling: min 1, max 10
- CPU allocation: 1 vCPU
- Memory: 512Mi

### deploy-cloudrun.sh
```bash
#!/bin/bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-aistudio-ai-photo-studio}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-ai-photo-studio-api}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

echo "Building and deploying ${SERVICE_NAME} to Cloud Run..."

gcloud builds submit \
  --project="${PROJECT_ID}" \
  --config=cloudbuild.yaml \
  --substitutions=_PROJECT_ID="${PROJECT_ID}",_SERVICE_NAME="${SERVICE_NAME}",_REGION="${REGION}",_IMAGE_TAG="${IMAGE_TAG}" .

echo "Deployment complete."
```

### deploy-cloudrun.ps1
```powershell
param(
    [string]$ProjectId = "aistudio-ai-photo-studio",
    [string]$Region = "us-central1",
    [string]$ServiceName = "ai-photo-studio-api",
    [string]$ImageTag = "latest"
)

Write-Host "Building and deploying ${ServiceName} to Cloud Run..."

gcloud builds submit `
  --project="${ProjectId}" `
  --config=cloudbuild.yaml `
  --substitutions=_PROJECT_ID="${ProjectId}",_SERVICE_NAME="${ServiceName}",_REGION="${Region}",_IMAGE_TAG="${ImageTag}" .

Write-Host "Deployment complete."
```

## Artifact Registry

### Repository
- **Name**: ai-photo-studio-api
- **Location**: us-central1
- **Format**: docker
- **Status**: NOT CREATED (blocked on billing)

### Image Naming
```
ai-photo-studio-api:v1.0.0-abc1234
ai-photo-studio-api:latest
ai-photo-studio-api:commit-sha
```

## Secret Manager Mapping

| Secret | Source | Rotation |
|--------|--------|----------|
| DATABASE_URL | Cloud SQL connection | Credential rotation |
| REDIS_URL | Memorystore connection | Credential rotation |
| JWT_SECRET | Generated secret | Quarterly |
| R2_ACCESS_KEY | Cloudflare R2 | Credential rotation |
| R2_SECRET_KEY | Cloudflare R2 | Credential rotation |
| R2_BUCKET | Static config | Manual |
| R2_ENDPOINT | Static config | Manual |
| GOOGLE_APPLICATION_CREDENTIALS | SA key JSON | SA rotation |

## Cloud SQL Migration

### Plan
1. Export Railway schema: `pg_dump --schema-only`
2. Review compatibility
3. Create Prisma migrations
4. Test locally

### Backup
1. Export Railway data: `pg_dump --format=custom`
2. Store in Cloud Storage
3. Verify integrity

### Rollback
1. Keep Railway running
2. Point traffic back to Railway if needed
3. Restore from backup

## Railway Rollback

### Current State
- Project: AI Photo Studio WhatsApp
- API: https://api-production-4867.up.railway.app
- DB: postgres.railway.internal:5432/railway
- Redis: redis.railway.internal:6379

### Rollback Steps
1. Update DNS/env to Railway URL
2. Verify Railway health
3. Monitor metrics

## Prerequisites Before Deployment

1. Google Cloud billing linked
2. APIs enabled (run, cloudbuild, artifactregistry, etc.)
3. Service account IAM roles granted
4. Service account key generated
5. GitHub remote updated
6. Cloudflare account switched
7. All verification passing

## Commands to Run After Blockers Cleared

```powershell
# Enable APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com compute.googleapis.com secretmanager.googleapis.com containerregistry.googleapis.com

# Grant IAM roles
gcloud projects add-iam-policy-binding aistudio-ai-photo-studio `
  --member="serviceAccount:github-actions-deploy@aistudio-ai-photo-studio.iam.gserviceaccount.com" `
  --role="roles/run.admin"
gcloud projects add-iam-policy-binding aistudio-ai-photo-studio `
  --member="serviceAccount:github-actions-deploy@aistudio-ai-photo-studio.iam.gserviceaccount.com" `
  --role="roles/artifactregistry.admin"

# Create Artifact Registry repo
gcloud artifacts repositories create ai-photo-studio-api `
  --repository-format=docker `
  --location=us-central1 `
  --project=aistudio-ai-photo-studio

# Generate SA key
gcloud iam service-accounts keys create .gcp-service-account.json `
  --iam-account=github-actions-deploy@aistudio-ai-photo-studio.iam.gserviceaccount.com

# Deploy
.\deploy-cloudrun.ps1 -ProjectId aistudio-ai-photo-studio -Region us-central1
```
