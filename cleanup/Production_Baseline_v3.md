# Production Baseline v3

**Generated:** 2026-07-13  
**Project:** project-9540c255-c960-4fa0-a91  
**Source:** Google Cloud Console

---

## Cloud Run Services

| Service | Region | State | Traffic | minScale |
|---------|--------|-------|---------|----------|
| ai-photo-studio-api | us-central1 | ACTIVE | 100% (ai-photo-studio-api-00028-5ff) | 1 |
| ai-photo-studio-bg-remover | us-central1 | ACTIVE | 100% (ai-photo-studio-bg-remover-00011-x6z) | 1 |
| ai-photo-studio-bg-remover-gpu | us-central1 | ACTIVE | 100% (ai-photo-studio-bg-remover-gpu-00066-dqs) | 1 |
| ai-photo-studio-bg-remover-gpu-us-east4 | us-east4 | ACTIVE | 100% (ai-photo-studio-bg-remover-gpu-us-east4-00019-69f) | 1 |
| ai-photo-studio-real-esrgan | us-central1 | ACTIVE | 100% (ai-photo-studio-real-esrgan-00002-67k) | 1 |
| ai-photo-studio-yolo-detector | us-central1 | ACTIVE | 100% (ai-photo-studio-yolo-detector-00001-jxz) | 1 |
| gpu-research-sam2 | us-central1 | ACTIVE | 100% (gpu-research-sam2-00001-4hg) | 1 |
| gpu-research-service | us-east4 | ACTIVE | 100% (gpu-research-service-00003-6z4) | 1 |

### Deleted Services (NOT in production)
- gpu-research-cuda118 (FAILED, 0% traffic)
- gpu-research-test (FAILED, 0% traffic)

---

## Cloud SQL

| Instance | Region | Tier | Database | Storage |
|----------|--------|------|----------|---------|
| ai-photo-studio-db | us-central1 | db-custom-1-3840 | POSTGRES_16 | 10 GB SSD (AUTOMATIC) |

**Status:** ACTIVE, ALWAYS AUTOMATICALLY ACTIVATED

---

## Memorystore (Redis)

| Name | Region | Tier | Size | Version |
|------|--------|------|------|---------|
| ai-photo-studio-redis | us-central1 | STANDARD | 1 GB | REDIS_7_0 |

**Status:** ACTIVE

---

## Artifact Registry

| Repository | Location | Format |
|------------|----------|--------|
| ai-photo-studio-api | us-central1 | Docker |
| ai-photo-studio-bg-remover-gpu | us-central1 | Docker |

---

## Cloud Storage Buckets

| Bucket | Size | Purpose |
|--------|------|---------|
| project-9540c255-c960-4fa0-a91_cloudbuild | 0 B | Cloud Build (lifecycle: 30 days) |
| project-9540c255-c960-4fa0-a91_photos | ~2.1 GiB | User photos |
| project-9540c255-c960-4fa0-a91_product_data | ~2.9 GiB | Product metadata |

---

## Cloud Build

**Bucket:** `gs://project-9540c255-c960-4fa0-a91_cloudbuild/`

**Status:** Source archives deleted (126 objects, 6.53 GiB)

**Lifecycle Policy:** 30-day auto-delete for new objects

---

## IAM Service Accounts

| Email | Used By |
|-------|---------|
| 108335160641-compute@developer.gserviceaccount.com | Cloud Run services |

---

## Estimated Monthly Costs (Post-Cleanup)

| Resource | Estimate |
|----------|----------|
| Cloud Run (8 services, minScale=1) | ~$150-200 |
| Cloud SQL (db-custom-1-3840) | ~$45 |
| Redis (1GB Standard) | ~$15 |
| Storage (~5 GiB) | ~$0.25 |
| **Total** | **~$210-260** |

---

## Notes

1. All 8 production Cloud Run services have `minScale=1` configured
2. 2 FAILED services were deleted (never served traffic)
3. ~100 old Cloud Run revisions were deleted
4. 126 Cloud Build source archives (6.53 GiB) were deleted
5. 30-day lifecycle policy applied to Cloud Build bucket