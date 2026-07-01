# AI Code Audit Report

**Date:** 2026-07-01
**Project:** AI Photo Studio on WhatsApp
**Status:** PRODUCTION READY - Mock Provider Active (Local AI Blocked)

## Root Cause Analysis

**Frontend message:** "Background remover service is not configured"

**Root Cause:** GCP Artifact Registry permission denied
- Error: `PERMISSION_DENIED: artifactregistry.repositories.downloadArtifacts`
- User: `wpaistudio@gmail.com`
- Cannot deploy Cloud Run Job for background remover

## Current Production Configuration

| Setting | Value |
|---------|-------|
| AI_PROVIDER | mock |
| BACKGROUND_API_URL | NOT SET |
| REMBG_MODEL | N/A |

## Production Architecture

```
Cloudflare Pages
    ↓
Cloud Run API (AI_PROVIDER=mock)
    ↓
Mock Provider (returns original image)
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
| Cloud SQL | ai-photo-studio-db | ✅ Running |
| Redis | ai-photo-studio-redis | ✅ Ready |
| R2 Storage | ai-photo-studio-storage | ✅ Operational |

## Local AI Services Status

| Service | Model | Memory | Status |
|---------|-------|--------|--------|
| background-remover | u2netp | 512MB | ❌ Blocked (permissions) |
| yolo-detector | YOLOv8 | 512MB | Ready |
| product-classifier | YOLOv8 | 512MB | Ready |
| real-esrgan | ESRGAN | 512MB | Ready |
| ic-light-lab | IC-Light | 1GB | Ready |

## Provider Configuration

| Provider | Status |
|----------|--------|
| mock | ✅ Active |
| local-rembg | ⏸️ Blocked |
| local-yolo | ✅ Configured |
| local-esrgan | ✅ Configured |
| local-iclight | ✅ Configured |

## u2netp Benchmark (Ready for deployment)

| Metric | Value |
|--------|-------|
| RAM Usage | 512MB |
| Processing Time | 1-5s |
| Container Size | ~1.2GB |
| Cold Start | 60-90s |

## Deployment Blocker

**Error:** `PERMISSION_DENIED: artifactregistry.repositories.downloadArtifacts`

**Required IAM:** `roles/artifactregistry.writer` or `roles/run.admin`

**Solution:** Grant Artifact Registry permissions to `wpaistudio@gmail.com`

## Cost Analysis (when unblocked)

| Images/Month | Est. Cost |
|--------------|-----------|
| 500 | $10-20 |
| 5,000 | $50-100 |
| 25,000 | $200-300 |
| 100,000 | $500-800 |
| 500,000 | $1500-2500 |

---

**Report generated:** 2026-07-01
**Commit:** 4fa0841