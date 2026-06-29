# Secret Manager Mapping

## Phase 2.0 — Secret Inventory for Google Cloud Migration

Generated: 2026-06-30

## Overview

This document maps all secrets required for the Google Cloud deployment. Secrets are referenced by name only. No actual secret values are stored here.

## Google Cloud Secret Manager Mapping

| GCP Secret Name | Environment Variable | Source | Rotation Policy |
|-----------------|---------------------|--------|------------------|
| DATABASE_URL | DATABASE_URL | Cloud SQL connection string | On credential rotation |
| REDIS_URL | REDIS_URL | Memorystore connection string | On credential rotation |
| JWT_SECRET | JWT_SECRET | Generated 256-bit secret | Quarterly |
| R2_ACCESS_KEY | R2_ACCESS_KEY_ID | Cloudflare R2 | On credential rotation |
| R2_SECRET_KEY | R2_SECRET_ACCESS_KEY | Cloudflare R2 | On credential rotation |
| R2_BUCKET | R2_BUCKET_NAME | Static: ai-photo-studio-storage | Manual |
| R2_ENDPOINT | R2_PUBLIC_BASE_URL | Static: https://account.r2.cloudflarestorage.com | Manual |
| GOOGLE_APPLICATION_CREDENTIALS | GOOGLE_APPLICATION_CREDENTIALS | Service account JSON key | SA rotation |

## Secret Manager Commands

### Create Secrets (after billing enabled)

```powershell
# DATABASE_URL
gcloud secrets create DATABASE_URL --replication-policy="automatic"
echo -n "postgresql://user:pass@host:5432/db" | gcloud secrets versions add DATABASE_URL --data-file=-

# REDIS_URL
gcloud secrets create REDIS_URL --replication-policy="automatic"
echo -n "redis://host:6379" | gcloud secrets versions add REDIS_URL --data-file=-

# JWT_SECRET
gcloud secrets create JWT_SECRET --replication-policy="automatic"
echo -n "$(openssl rand -base64 32)" | gcloud secrets versions add JWT_SECRET --data-file=-

# R2_ACCESS_KEY
gcloud secrets create R2_ACCESS_KEY --replication-policy="automatic"
echo -n "ACCESS_KEY_ID" | gcloud secrets versions add R2_ACCESS_KEY --data-file=-

# R2_SECRET_KEY
gcloud secrets create R2_SECRET_KEY --replication-policy="automatic"
echo -n "SECRET_ACCESS_KEY" | gcloud secrets versions add R2_SECRET_KEY --data-file=-

# R2_BUCKET
gcloud secrets create R2_BUCKET --replication-policy="automatic"
echo -n "ai-photo-studio-storage" | gcloud secrets versions add R2_BUCKET --data-file=-

# R2_ENDPOINT
gcloud secrets create R2_ENDPOINT --replication-policy="automatic"
echo -n "https://2eb5eadd4af6da3d3a5f6c61d92437e4.r2.cloudflarestorage.com" | gcloud secrets versions add R2_ENDPOINT --data-file=-

# GOOGLE_APPLICATION_CREDENTIALS (JSON file)
gcloud secrets create GOOGLE_APPLICATION_CREDENTIALS --replication-policy="automatic"
gcloud secrets versions add GOOGLE_APPLICATION_CREDENTIALS --data-file=".gcp-service-account.json"
```

## IAM Policy for Service Account

Grant Cloud Run service account access to secrets:

```powershell
gcloud secrets add-iam-policy-binding DATABASE_URL `
  --member="serviceAccount:github-actions-deploy@aistudio-ai-photo-studio.iam.gserviceaccount.com" `
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding REDIS_URL `
  --member="serviceAccount:github-actions-deploy@aistudio-ai-photo-studio.iam.gserviceaccount.com" `
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding JWT_SECRET `
  --member="serviceAccount:github-actions-deploy@aistudio-ai-photo-studio.iam.gserviceaccount.com" `
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding R2_ACCESS_KEY `
  --member="serviceAccount:github-actions-deploy@aistudio-ai-photo-studio.iam.gserviceaccount.com" `
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding R2_SECRET_KEY `
  --member="serviceAccount:github-actions-deploy@aistudio-ai-photo-studio.iam.gserviceaccount.com" `
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding R2_BUCKET `
  --member="serviceAccount:github-actions-deploy@aistudio-ai-photo-studio.iam.gserviceaccount.com" `
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding R2_ENDPOINT `
  --member="serviceAccount:github-actions-deploy@aistudio-ai-photo-studio.iam.gserviceaccount.com" `
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding GOOGLE_APPLICATION_CREDENTIALS `
  --member="serviceAccount:github-actions-deploy@aistudio-ai-photo-studio.iam.gserviceaccount.com" `
  --role="roles/secretmanager.secretAccessor"
```

## Environment Variable Reference

### Cloud Run Environment Variables (via Secret Manager)

```yaml
env:
- name: DATABASE_URL
  secret: projects/aistudio-ai-photo-studio/secrets/DATABASE_URL/versions/latest
- name: REDIS_URL
  secret: projects/aistudio-ai-photo-studio/secrets/REDIS_URL/versions/latest
- name: JWT_SECRET
  secret: projects/aistudio-ai-photo-studio/secrets/JWT_SECRET/versions/latest
- name: R2_ACCESS_KEY_ID
  secret: projects/aistudio-ai-photo-studio/secrets/R2_ACCESS_KEY/versions/latest
- name: R2_SECRET_ACCESS_KEY
  secret: projects/aistudio-ai-photo-studio/secrets/R2_SECRET_KEY/versions/latest
- name: R2_BUCKET_NAME
  secret: projects/aistudio-ai-photo-studio/secrets/R2_BUCKET/versions/latest
- name: R2_PUBLIC_BASE_URL
  secret: projects/aistudio-ai-photo-studio/secrets/R2_ENDPOINT/versions/latest
- name: GOOGLE_APPLICATION_CREDENTIALS
  secret: projects/aistudio-ai-photo-studio/secrets/GOOGLE_APPLICATION_CREDENTIALS/versions/latest
```

## Security Notes

- Never commit `.gcp-service-account.json` to Git
- Rotate JWT_SECRET quarterly
- Rotate R2 keys on credential rotation
- Use Secret Manager versions for zero-downtime rotation
- Grant least-privilege IAM roles
