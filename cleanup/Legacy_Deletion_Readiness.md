# Cloud Run Legacy Service Deletion Readiness

**Generated:** 2026-07-18  
**Source:** gcloud CLI (read-only) + source code analysis  
**Phase:** OPS-01A

---

## Summary

| Service | Region | 0% Traffic | No Env Ref | No Provider Ref | No Worker Ref | No Deploy Ref | Policy Updated | **READY?** |
|---------|--------|-----------|------------|----------------|---------------|---------------|----------------|------------|
| ai-photo-studio-lama | us-central1 | ❌ 100% | ✅ | ✅ | ✅ | ✅ | ✅ | **NOT READY** |
| ai-photo-studio-gfpgan | us-central1 | ❌ 100% | ✅ | ✅ | ✅ | ✅ | ✅ | **NOT READY** |
| ai-photo-studio-codeformer | us-central1 | ❌ 100% | ✅ | ✅ | ✅ | ✅ | ✅ | **NOT READY** |
| ai-photo-studio-ddcolor | us-central1 | ❌ 100% | ✅ | ✅ | ✅ | ✅ | ✅ | **NOT READY** |
| ai-photo-studio-real-esrgan | us-central1 | ❌ 100% | ✅ | ✅ | ✅ | ✅ | ✅ | **NOT READY** |
| ai-photo-studio-bg-remover-gpu-us-east4 | us-east4 | ❌ 100% | ✅ | ✅ | ✅ | ✅ | ✅ | **NOT READY** |
| gpu-research-service | us-east4 | ❌ 100% | ✅ | ✅ | ✅ | ✅ | ✅ | **NOT READY** |

**All 7 services are NOT READY for deletion.** Primary blocker: all are running at 100% traffic. No service has been set to 0% traffic.

---

## Per-Service Detail

### 1. ai-photo-studio-lama (us-central1)

| Check | Result | Evidence |
|-------|--------|----------|
| **Traffic** | ❌ 100% | `spec.traffic[0]: {latestRevision: True, percent: 100}` |
| **Env var reference (API)** | ✅ NONE | `RESTORATION_LAMA_URL` exists in API env but has **no value** |
| **Provider reference** | ✅ NONE | `grep` of `apps/api/src` returns zero results |
| **Worker reference** | ✅ NONE | `grep` of workers returns zero results |
| **Deploy script reference** | ✅ NONE | `deploy.yml` only deploys `ai-photo-studio-api` |
| **Policy updated** | ✅ YES | `Deployment_Policy.md` Section 9 lists as RETIRED |
| **Latest revision** | `ai-photo-studio-lama-00002-kwf` | Created 2026-07-17, generation 2 |
| **Configuration** | `maxScale: 20`, `concurrency: 1`, 2Gi memory | |

### 2. ai-photo-studio-gfpgan (us-central1)

| Check | Result | Evidence |
|-------|--------|----------|
| **Traffic** | ❌ 100% | `spec.traffic[0]: {latestRevision: True, percent: 100}` |
| **Env var reference (API)** | ✅ NONE | `RESTORATION_GFPGAN_URL` exists but has **no value** |
| **Provider reference** | ✅ NONE | `grep` returns zero results |
| **Worker reference** | ✅ NONE | `grep` returns zero results |
| **Deploy script reference** | ✅ NONE | `deploy.yml` only deploys `ai-photo-studio-api` |
| **Policy updated** | ✅ YES | Listed as RETIRED |
| **Latest revision** | `ai-photo-studio-gfpgan-00002-85h` | Created 2026-07-17, generation 2 |

### 3. ai-photo-studio-codeformer (us-central1)

| Check | Result | Evidence |
|-------|--------|----------|
| **Traffic** | ❌ 100% | `spec.traffic[0]: {latestRevision: True, percent: 100}` |
| **Env var reference (API)** | ✅ NONE | `RESTORATION_CODEFORMER_URL` exists but has **no value** |
| **Provider reference** | ✅ NONE | `grep` returns zero results |
| **Worker reference** | ✅ NONE | `grep` returns zero results |
| **Policy updated** | ✅ YES | Listed as RETIRED |
| **Latest revision** | `ai-photo-studio-codeformer-00002-t65` | Created 2026-07-17, generation 2 |

### 4. ai-photo-studio-ddcolor (us-central1)

| Check | Result | Evidence |
|-------|--------|----------|
| **Traffic** | ❌ 100% | `spec.traffic[0]: {latestRevision: True, percent: 100}` |
| **Env var reference (API)** | ✅ NONE | `RESTORATION_DDCOLOR_URL` exists but has **no value** |
| **Provider reference** | ✅ NONE | `grep` returns zero results |
| **Worker reference** | ✅ NONE | `grep` returns zero results |
| **Policy updated** | ✅ YES | Listed as RETIRED |
| **Latest revision** | `ai-photo-studio-ddcolor-00002-4jh` | Created 2026-07-17, generation 2 |

### 5. ai-photo-studio-real-esrgan (us-central1)

| Check | Result | Evidence |
|-------|--------|----------|
| **Traffic** | ❌ 100% | `spec.traffic[0]: {latestRevision: True, percent: 100}` |
| **Env var reference (API)** | ✅ NONE | Never had an API env var |
| **Provider reference** | ✅ NONE | `grep` returns zero results |
| **Worker reference** | ✅ NONE | `grep` returns zero results |
| **Policy updated** | ✅ YES | Listed as RETIRED |
| **Latest revision** | `ai-photo-studio-real-esrgan-00003-rb5` | Created 2026-07-17, generation 3 |

### 6. ai-photo-studio-bg-remover-gpu-us-east4 (us-east4)

| Check | Result | Evidence |
|-------|--------|----------|
| **Traffic** | ❌ 100% | `spec.traffic[0]: {latestRevision: True, percent: 100}` |
| **Env var reference (API)** | ✅ NONE | Not referenced from API |
| **Provider reference** | ✅ NONE | API uses unified `ai-bg-remover` RunPod endpoint |
| **Worker reference** | ✅ NONE | Not referenced |
| **Policy updated** | ✅ YES | Listed as RETIRED |
| **Latest revision** | `ai-photo-studio-bg-remover-gpu-us-east4-00019-69f` | Created 2026-07-08, generation 19 |

### 7. gpu-research-service (us-east4)

| Check | Result | Evidence |
|-------|--------|----------|
| **Traffic** | ❌ 100% | `spec.traffic[0]: {latestRevision: True, percent: 100}` |
| **Env var reference (API)** | ✅ NONE | Not referenced |
| **Provider reference** | ✅ NONE | Not referenced |
| **Worker reference** | ✅ NONE | Not referenced |
| **Policy updated** | ✅ YES | Listed as RETIRED |
| **Latest revision** | `gpu-research-service-00003-6z4` | Created 2026-07-09, generation 3 |

---

## Blockers

| # | Blocker | Services Affected | Resolution |
|---|---------|------------------|------------|
| 1 | **100% traffic** | All 7 | Set `traffic` to 0% or stop service. This is the only blocker |
| 2 | Legacy RESTORATION_*_URL env vars still declared on API | 4 (lama, gfpgan, codeformer, ddcolor) | Remove env var declarations from API service — they are empty but still present |

---

## Cost Impact of NOT Deleting

These 7 services cost approximately **$150-200/month** in Cloud Run compute. Since all have `maxScale > 0` and are serving 100% traffic, they can scale up to serve requests.

---

## Prerequisites Met (Non-Blocking)

- ✅ No provider references in code (zero grep matches in `apps/api/src`)
- ✅ No worker references (zero grep matches)
- ✅ No deployment script references (`deploy.yml` only deploys `ai-photo-studio-api`)
- ✅ Legacy env vars are empty (exist but have no values)
- ✅ Deployment Policy updated with RETIRED section
