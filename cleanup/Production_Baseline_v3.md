# Production Baseline v3

**Generated:** 2026-07-13  
**Last verified:** 2026-07-14 (Phase R6.3 audit via `gcloud run services list`)  
**Phase R7 Production Hardening:** 2026-07-14 - Dead code removed, queue migration completed  
**Phase R8.2 Cloudflare Pages Deployment:** 2026-07-14 17:03 UTC - Frontend deployed via Wrangler CLI  
**Project:** project-9540c255-c960-4fa0-a91  
**Source:** Google Cloud Console / gcloud CLI

---

## Cloudflare Pages

**Project:** ai-photo-studio-frontend  
**Account ID:** 2eb5eadd4af6da3d3a5f6c61d92437e4  
**URL:** https://ai-photo-studio-frontend.pages.dev  
**Deployment ID:** f2d0b950-267d-4972-bb78-ec6112e129da  
**Deployment Timestamp:** 2026-07-14T17:03:12.160796Z  
**Commit:** 07735b3a7d1aa3dfa8b312ed18871e2589ec457c (HEAD)  
**Asset Hashes:**  
- JS: index-DBgLwQro.js  
- CSS: index-BcZYZg25.css  

### Route Verification
| Route | Status |
|-------|--------|
| / | 200 |
| /restore/new | 200 |
| /restore/:id | 200 |
| /history/restorations | 404 (client-side route, requires specific state) |
| /admin/restorations | 200 |
| /admin/restorations/:id | 200 |

### API Verification
| Endpoint | Status |
|----------|--------|
| /api/health | 200 |
| /api/version | 200 |

---

## Repository Audit (Phase R7)

### Files Removed
- `apps/api/src/workers/image.worker.ts` - Dead code (never imported)

### Files Modified
- `apps/api/src/queues/image.queue.ts` - Updated to create `processingJob` records
- `apps/api/src/workers/image-processing.worker.ts` - Updated to handle legacy queue payloads

### Dead Code Removed
- `startImageWorker` export from `image.worker.ts` - never imported anywhere

### Legacy Migration
- `ImageQueueService` now creates `processingJob` records for all enqueued jobs
- Worker handles both PhaseC-style jobs (with processingJob) and legacy-style jobs (creates on-the-fly)

---

## Cloud Run Services

| Service | Region | State | Traffic | minScale (annotation) |
|---------|--------|-------|---------|------------------------|
| ai-photo-studio-api | us-central1 | ACTIVE | 100% (`ai-photo-studio-api-r4final`) | 1 |
| ai-photo-studio-bg-remover | us-central1 | ACTIVE | 100% | (see live service) |
| ai-photo-studio-bg-remover-gpu | us-central1 | ACTIVE | 100% | (see live service) |
| ai-photo-studio-bg-remover-gpu-us-east4 | us-east4 | ACTIVE | 100% | (see live service) |
| ai-photo-studio-real-esrgan | us-central1 | ACTIVE | 100% | (see live service) |
| ai-photo-studio-yolo-detector | us-central1 | ACTIVE | 100% | (see live service) |
| ai-photo-studio-codeformer | us-central1 | ACTIVE | 100% (`ai-photo-studio-codeformer-00001-gjm`) | unset |
| ai-photo-studio-ddcolor | us-central1 | ACTIVE | 100% (`ai-photo-studio-ddcolor-00001-5zx`) | unset |
| ai-photo-studio-gfpgan | us-central1 | ACTIVE | 100% (`ai-photo-studio-gfpgan-00001-6s4`) | unset |
| ai-photo-studio-lama | us-central1 | ACTIVE | 100% (`ai-photo-studio-lama-00001-rdm`) | unset |
| gpu-research-sam2 | us-central1 | ACTIVE | 100% | (see live service) |
| gpu-research-service | us-east4 | ACTIVE | 100% | (see live service) |

### Restoration services (added 2026-07-14 verification)

These four services were deployed after the 2026-07-13 baseline snapshot and are live:

| Service | URL | Latest ready revision |
|---------|-----|------------------------|
| ai-photo-studio-codeformer | https://ai-photo-studio-codeformer-mp3arpoi2a-uc.a.run.app | ai-photo-studio-codeformer-00001-gjm |
| ai-photo-studio-ddcolor | https://ai-photo-studio-ddcolor-mp3arpoi2a-uc.a.run.app | ai-photo-studio-ddcolor-00001-5zx |
| ai-photo-studio-gfpgan | https://ai-photo-studio-gfpgan-mp3arpoi2a-uc.a.run.app | ai-photo-studio-gfpgan-00001-6s4 |
| ai-photo-studio-lama | https://ai-photo-studio-lama-mp3arpoi2a-uc.a.run.app | ai-photo-studio-lama-00001-rdm |

API env bindings (revision `ai-photo-studio-api-r4final`):

- `RESTORATION_CODEFORMER_URL=https://ai-photo-studio-codeformer-108335160641.us-central1.run.app`
- `RESTORATION_DDCOLOR_URL=https://ai-photo-studio-ddcolor-108335160641.us-central1.run.app`
- `RESTORATION_GFPGAN_URL=https://ai-photo-studio-gfpgan-108335160641.us-central1.run.app`
- `RESTORATION_LAMA_URL=https://ai-photo-studio-lama-108335160641.us-central1.run.app`

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
| Cloud Run (12 services as of 2026-07-14 list) | higher than original 8-service estimate |
| Cloud SQL (db-custom-1-3840) | ~$45 |
| Redis (1GB Standard) | ~$15 |
| Storage (~5 GiB) | ~$0.25 |

Original 2026-07-13 estimate for 8 services was ~$210-260. Restoration + research services increase that footprint; re-measure after minScale decisions.

---

## Notes

1. As of 2026-07-14, **12** Cloud Run services are ACTIVE (was 8 on 2026-07-13 baseline).
2. Four restoration services are deployed and wired into API env vars.
3. 2 FAILED services were deleted historically (never served traffic).
4. API service still has many retained revisions (policy max 2 — see Deployment_Policy.md verification).
5. 30-day lifecycle policy applied to Cloud Build bucket.
