# Secret Manager Mapping

## Phase 2.1 — Secret Inventory for Google Cloud Migration

Generated: 2026-06-30

## Overview

This document maps all secrets required for the Google Cloud deployment. Secrets are referenced by name only. No actual secret values are stored here.

## Google Cloud Secret Manager Mapping

| GCP Secret Name | Environment Variable | Source | Rotation Policy | Status |
|-----------------|---------------------|--------|------------------|--------|
| DATABASE_URL | DATABASE_URL | Cloud SQL connection string | On credential rotation | CREATED (v2) |
| REDIS_URL | REDIS_URL | Memorystore connection string | On credential rotation | CREATED |
| JWT_SECRET | JWT_SECRET | Generated 256-bit secret | Quarterly | CREATED |
| R2_ACCESS_KEY | R2_ACCESS_KEY_ID | Cloudflare R2 | On credential rotation | CREATED (placeholder) |
| R2_SECRET_KEY | R2_SECRET_ACCESS_KEY | Cloudflare R2 | On credential rotation | CREATED (placeholder) |
| R2_BUCKET | R2_BUCKET_NAME | Static: ai-photo-studio-storage | Manual | CREATED |
| R2_ENDPOINT | R2_PUBLIC_BASE_URL | Static: https://2eb5eadd4af6da3d3a5f6c61d92437e4.r2.cloudflarestorage.com | Manual | CREATED |

## Actual Secret Values (DO NOT COMMIT)

Project: project-9540c255-c960-4fa0-a91

- **DATABASE_URL**: postgresql://app_user:AppUser2026!@136.115.21.123:5432/ai_photo_studio
- **REDIS_URL**: redis://10.74.177.27:6379
- **JWT_SECRET**: [random 32-byte token - stored in Secret Manager]
- **R2_ACCESS_KEY**: [placeholder - replace with actual key]
- **R2_SECRET_KEY**: [placeholder - replace with actual key]
- **R2_BUCKET**: ai-photo-studio-storage
- **R2_ENDPOINT**: https://2eb5eadd4af6da3d3a5f6c61d92437e4.r2.cloudflarestorage.com

## Workload Identity

Service account keys are NOT used. Authentication is handled via Workload Identity Federation:

- **Pool**: github-pool (global)
- **Provider**: github-provider (OIDC, issuer: https://token.actions.githubusercontent.com)
- **Service Account**: github-actions-deploy@project-9540c255-c960-4fa0-a91.iam.gserviceaccount.com
- **Role**: roles/iam.workloadIdentityUser
- **GitHub Actions Config**:
  ```yaml
  permissions:
    id-token: write
    contents: read
  steps:
  - uses: google-github-actions/auth@v2
    with:
      workload_identity_provider: projects/9540c255-c960-4fa0-a91/locations/global/workloadIdentityPools/github-pool/providers/github-provider
      service_account: github-actions-deploy@project-9540c255-c960-4fa0-a91.iam.gserviceaccount.com
  ```

## IAM Policy for Service Account

```powershell
# Granted (2026-06-30):
gcloud projects add-iam-policy-binding project-9540c255-c960-4fa0-a91 `
  --member="serviceAccount:github-actions-deploy@project-9540c255-c960-4fa0-a91.iam.gserviceaccount.com" `
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding project-9540c255-c960-4fa0-a91 `
  --member="serviceAccount:github-actions-deploy@project-9540c255-c960-4fa0-a91.iam.gserviceaccount.com" `
  --role="roles/artifactregistry.admin"

gcloud projects add-iam-policy-binding project-9540c255-c960-4fa0-a91 `
  --member="serviceAccount:github-actions-deploy@project-9540c255-c960-4fa0-a91.iam.gserviceaccount.com" `
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding project-9540c255-c960-4fa0-a91 `
  --member="serviceAccount:github-actions-deploy@project-9540c255-c960-4fa0-a91.iam.gserviceaccount.com" `
  --role="roles/secretmanager.secretAccessor"
```

## Security Notes

- Never commit `.gcp-service-account.json` to Git (file is empty/blocked by org policy)
- Rotate JWT_SECRET quarterly
- Rotate R2 keys on credential rotation
- Use Secret Manager versions for zero-downtime rotation
- Grant least-privilege IAM roles
- Workload Identity eliminates the need for long-lived service account keys
