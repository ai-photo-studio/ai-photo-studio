# AI Code Audit Report

**Date:** 2026-07-02
**Project:** AI Photo Studio on WhatsApp
**Status:** PRODUCTION READY - Local AI Pipeline Active

## Resolution Summary

**Issue Resolved:** GCP Artifact Registry permission denied
- Error: `PERMISSION_DENIED: artifactregistry.repositories.uploadArtifacts`
- Solution: Granted `roles/artifactregistry.writer` to Cloud Build and Compute service accounts
- Result: Successfully deployed background-remover service

## Current Production Configuration

| Setting | Value |
|---------|-------|
| AI_PROVIDER | local-rembg |
| BACKGROUND_API_URL | https://ai-photo-studio-bg-remover-mp3arpoi2a-uc.a.run.app |
| REMBG_MODEL | u2netp |

## Production Architecture

```
Cloudflare Pages
    ↓
Cloud Run API (AI_PROVIDER=local-rembg)
    ↓
Cloud Run Background Remover (u2netp)
    ↓
Cloudflare R2
    ↓
Cloud SQL
```

## Production URLs

| Service | URL | Status |
|---------|-----|--------|
| Cloud Run API | https://ai-photo-studio-api-108335160641.us-central1.run.app | ✅ Active |
| Cloudflare Pages | https://29105fb4.ai-photo-studio-frontend.pages.dev | ✅ Active |
| Background Remover | https://ai-photo-studio-bg-remover-mp3arpoi2a-uc.a.run.app | ✅ Active |
| Cloud SQL | ai-photo-studio-db | ✅ Running |
| Redis | ai-photo-studio-redis | ✅ Ready |
| R2 Storage | ai-photo-studio-storage | ✅ Operational |

## Local AI Services Status

| Service | Model | Memory | Status |
|---------|-------|--------|--------|
| background-remover | rembg (u2netp) | 512MB | ✅ Deployed |
| yolo-detector | YOLOv8 | 512MB | Ready |
| product-classifier | YOLOv8 | 512MB | Ready |
| real-esrgan | ESRGAN | 512MB | Ready |
| ic-light-lab | IC-Light | 1GB | Ready |

## Provider Configuration

| Provider | Status |
|----------|--------|
| mock | ❌ Disabled |
| local-rembg | ✅ Active |
| local-yolo | ✅ Configured |
| local-esrgan | ✅ Configured |
| local-iclight | ✅ Configured |

## u2netp Benchmark

| Metric | Value |
|--------|-------|
| RAM Usage | 512MB |
| Processing Time | 1-5s |
| Container Size | ~250MB |
| Cold Start | 10-30s |

## IAM Changes Made

**Before:**
- `serviceAccount:108335160641@cloudbuild.gserviceaccount.com` - No Artifact Registry permissions
- `serviceAccount:108335160641-compute@developer.gserviceaccount.com` - No Artifact Registry permissions

**After:**
- `serviceAccount:108335160641@cloudbuild.gserviceaccount.com` - `roles/artifactregistry.writer`
- `serviceAccount:108335160641-compute@developer.gserviceaccount.com` - `roles/artifactregistry.writer`

## Cost Analysis (Production)

| Images/Month | Est. Cost |
|--------------|-----------|
| 500 | $10-20 |
| 5,000 | $50-100 |
| 25,000 | $200-300 |
| 100,000 | $500-800 |
| 500,000 | $1500-2500 |

---

**Report generated:** 2026-07-02
**Deployment:** Phase 4.5 Complete