# Production Baseline v2

**Project:** project-9540c255-c960-4fa0-a91
**Billing Account:** 018EE7-59050E-DA31E6
**Generated:** 2026-07-13
**Status:** This is the permanent production baseline. Only resources listed here should exist post-cleanup.

---

## 1. PRODUCTION CLOUD RUN SERVICES (KEEP)

| Service | Region | Serving Revision | Traffic | minScale | maxScale | Notes |
|---|---|---|---|---|---|---|
| ai-photo-studio-api | us-central1 | 00028-5ff | 100% | 1 | 10 | + tag `gpulatest` → 00029-yad |
| ai-photo-studio-bg-remover | us-central1 | 00011-x6z | 100% | 1 | 3 | CPU-only |
| ai-photo-studio-bg-remover-gpu | us-central1 | 00066-dqs | 100% | 1 | 2 | GPU, cpu-throttling=false |
| ai-photo-studio-bg-remover-gpu-us-east4 | us-east4 | 00019-69f | 100% | 1 | 3 | GPU |
| ai-photo-studio-real-esrgan | us-central1 | 00002-67k | 100% | 1 | 3 | CPU-only |
| ai-photo-studio-yolo-detector | us-central1 | 00001-jxz | 100% | 1 | 3 | CPU-only |
| gpu-research-sam2 | us-central1 | 00001-4hg | 100% | 0 | — | GPU, research |
| gpu-research-service | us-east4 | 00003-6z4 | 100% | 0 | — | GPU, research |

## 2. PRODUCTION CLOUD SQL (KEEP, DO NOT MODIFY DATA)

| Instance | Region | Engine | Tier | Activation | Databases |
|---|---|---|---|---|---|
| ai-photo-studio-db | us-central1 | POSTGRES_16 | db-perf-optimized-N-2 (ENTERPRISE_PLUS) | ALWAYS | postgres, ai_photo_studio |

## 3. PRODUCTION REDIS (KEEP)

| Instance | Region | Size | Version |
|---|---|---|---|
| ai-photo-studio-redis | us-central1-b | 1 GB | REDIS_7_0 |

## 4. STORAGE BUCKETS (KEEP)

| Bucket | Purpose | Current Size |
|---|---|---|
| project-9540c255-c960-4fa0-a91_cloudbuild | Cloud Build source/logs | ~7.0 GiB (apply 30d lifecycle) |
| project-9540c255-c960-4fa0-a91-cloudbuild-logs | Build logs | ~1.0 MB |
| run-sources-project-9540c255-c960-4fa0-a91-us-central1 | Run source | ~26 KB |

## 5. ARTIFACT REGISTRY (KEEP — empty, used for deploys)

| Repo | Location | Format |
|---|---|---|
| ai-photo-studio-api | us-central1 | DOCKER |
| cloud-run-source-deploy | us-central1 | DOCKER |

## 6. SECRETS (KEEP)

ADMIN_JWT_SECRET, DATABASE_URL, JWT_SECRET, R2_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT,
R2_SECRET_KEY, REDIS_URL, ai-photo-studio-secrets

## 7. SERVICE ACCOUNTS

- 108335160641-compute@developer.gserviceaccount.com (used by Cloud Run revisions)

## 8. APIs / ENABLED SURFACE (observed)

Cloud Run, Cloud SQL, Cloud Build, Cloud Storage, Artifact Registry, Secret Manager,
Redis (Memorystore), Cloud Logging (default + required sinks), VPC default network.
Not enabled: Cloud Scheduler, Cloud Tasks, Pub/Sub, Vertex AI, Billing Budgets.

## 9. GPU SERVICES

bg-remover-gpu (us-central1), bg-remover-gpu-us-east4 (us-east4), gpu-research-sam2, gpu-research-service.

## 10. DEPLOYMENT PROCESS (current, as observed)

1. Source pushed → Cloud Build produces image in Artifact Registry.
2. `gcloud run deploy` creates a NEW revision each time.
3. Traffic is cut 100% to the latest ready revision.
4. Old revisions accumulate (up to 72 observed) and are NOT auto-deleted.

## 11. CI/CD PROCESS (current)

- Cloud Build history present (mix of SUCCESS / FAILURE / TIMEOUT in last 48h).
- No Cloud Build triggers configured (deploys appear manual / scripted).
- Build source archives retained indefinitely in GCS (no lifecycle).

## 12. REMOVED FROM BASELINE (post-cleanup should not exist)

- gpu-research-cuda118 (FAILED service) — DELETE
- gpu-research-test (FAILED service) — DELETE
- 108 old non-traffic Cloud Run revisions — DELETE
- 126 obsolete Cloud Build source archives (~7 GiB) — DELETE
