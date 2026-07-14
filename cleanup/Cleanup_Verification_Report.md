# Phase 1 Cleanup Verification Report

**Project:** project-9540c255-c960-4fa0-a91  
**Date:** 2026-07-13  
**Status:** COMPLETED

## Summary

| Category | Before | After | Deleted |
|----------|--------|-------|---------|
| Cloud Run Services | 10 | 8 | 2 FAILED services |
| Total Revisions | ~110 | 10 | ~100 old revisions |
| Cloud Build Source | 126 objects (6.53 GiB) | 0 | 126 objects |

## Cloud Run Services

### Deleted Services (FAILED, never served traffic)
- `gpu-research-cuda118` (us-east4) - FAILED state, 0% traffic, not referenced
- `gpu-research-test` (us-east4) - FAILED state, 0% traffic, not referenced

### Retained Services (Production)
| Service | Region | Serving Revision |
|---------|--------|------------------|
| ai-photo-studio-api | us-central1 | ai-photo-studio-api-00028-5ff (100%) |
| ai-photo-studio-bg-remover | us-central1 | ai-photo-studio-bg-remover-00011-x6z (100%) |
| ai-photo-studio-bg-remover-gpu | us-central1 | ai-photo-studio-bg-remover-gpu-00066-dqs (100%) |
| ai-photo-studio-bg-remover-gpu-us-east4 | us-east4 | ai-photo-studio-bg-remover-gpu-us-east4-00019-69f (100%) |
| ai-photo-studio-real-esrgan | us-central1 | ai-photo-studio-real-esrgan-00002-67k (100%) |
| ai-photo-studio-yolo-detector | us-central1 | ai-photo-studio-yolo-detector-00001-jxz (100%) |
| gpu-research-sam2 | us-central1 | gpu-research-sam2-00001-4hg (100%) |
| gpu-research-service | us-east4 | gpu-research-service-00003-6z4 (100%) |

### Retained Revisions (Tag/Serving)
- `ai-photo-studio-api-00029-yad` - tagged with `gpulatest` (for GPU testing)

## Revision Cleanup Details

### ai-photo-studio-api (us-central1)
- Before: 25 revisions
- After: 3 revisions (serving + tagged + latest created)
- Deleted: 22 revisions

### ai-photo-studio-bg-remover (us-central1)
- Before: 11 revisions
- After: 1 revision (serving)
- Deleted: 10 revisions

### ai-photo-studio-bg-remover-gpu (us-central1)
- Before: 71 revisions
- After: 2 revisions (serving + latest created)
- Deleted: 69 revisions

### ai-photo-studio-bg-remover-gpu-us-east4 (us-east4)
- Before: 19 revisions
- After: 1 revision (serving)
- Deleted: 18 revisions

### ai-photo-studio-real-esrgan (us-central1)
- Before: 2 revisions
- After: 1 revision (serving)
- Deleted: 1 revision

### ai-photo-studio-yolo-detector (us-central1)
- Before: 1 revision
- After: 1 revision (serving)
- Deleted: 0 revisions

### gpu-research-sam2 (us-central1)
- Before: 1 revision
- After: 1 revision (serving)
- Deleted: 0 revisions

### gpu-research-service (us-east4)
- Before: 3 revisions
- After: 1 revision (serving)
- Deleted: 2 revisions

## Cloud Build Storage

- Bucket: `gs://project-9540c255-c960-4fa0-a91_cloudbuild/`
- Source archives deleted: 126 objects (6.53 GiB)
- Lifecycle policy applied: 30-day auto-delete

## Notes

1. **Latest Created Revisions**: Some services have a "latest created" revision that cannot be deleted directly via gcloud (API limitation). These revisions are not serving traffic and incur no additional costs.

2. **Tagged Revision**: `ai-photo-studio-api-00029-yad` is tagged with `gpulatest` for GPU testing purposes and is retained.

3. **Lifecycle Policy**: A 30-day lifecycle policy has been applied to the Cloud Build bucket to prevent future accumulation of old build artifacts.

4. **Production Impact**: No production traffic was affected. All serving revisions remain intact.

## Files Generated

- `cleanup_execution.log` - Detailed execution log
- `Cleanup_Verification_Report.md` - This report
- `Production_Baseline_v3.md` - Updated baseline (to be generated)

---
*Report generated: 2026-07-13T20:10:00Z*