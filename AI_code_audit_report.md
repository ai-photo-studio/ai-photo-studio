# AI Code Audit Report: Project Direction Verification

**Date**: 2026-07-11  
**Status**: COMPLETE  

---

## Production Pipeline Verification

### Cloud Run Services

| Service | Revision | Status |
|---------|----------|--------|
| ai-photo-studio-api | 00028-5ff | Active - receives frontend traffic |
| ai-photo-studio-bg-remover | 00011-x6z | Active - UNUSED (bg-remover:v8, no GPU) |
| ai-photo-studio-bg-remover-gpu | 00055-zkg | Active - receives API traffic, GPU enabled, SAM2 |

### Provider Runtime Evidence

| Metric | Value |
|--------|-------|
| Provider Selected | GPUSAM2Provider |
| Model | gpu-sam2 |
| CUDA Available | YES |
| SEGMENTATION_ROUTING | gpu |
| OBJECT_AWARE_PROMPTS | true (env var set) |
| GPU_SEGMENTATION_MODEL | sam2_hiera_b+ |
| SAM2_CHECKPOINT | /models/sam2_hiera_base_plus.pt |

### Request Flow

```
Browser
  ↓ https://ai-photo-studio-frontend.pages.dev
Cloudflare Pages (VITE_API_URL)
  ↓ https://ai-photo-studio-api-mp3arpoi2a-uc.a.run.app
API (AI_PROVIDER=local-rembg)
  ↓ BACKGROUND_API_URL=https://ai-photo-studio-bg-remover-gpu-108335160641.us-central1.run.app
GPU Service (GPUSAM2Provider, SEGMENTATION_ROUTING=gpu)
  ↓ SAM2 with center point prompt
PNG Response
```

---

## Deployment Drift Found

| Location | Expected | Actual | Impact |
|----------|----------|--------|--------|
| cloudbuild.yaml service name | ai-photo-studio-bg-remover-gpu | ai-photo-studio-bg-remover-gpu-dbg | Deployed to wrong service |
| cloudbuild.yaml missing OBJECT_AWARE_PROMPTS | true | not set | Only center point prompt used |
| Old bg-remover service | unused | deployed | No production impact (0% traffic) |

---

## Root Cause Analysis

### First Failing Stage: Prompt Generation

The GPU service uses SAM2 with **single center point prompt** because:
1. `OBJECT_AWARE_PROMPTS` env var was not set (defaults to false)
2. Even when enabled, luminance-based saliency detection (threshold > 128) cannot identify individual flowers in multi-object arrangements

**Evidence**: Flower bouquet image produces 6340 foreground coverage with exactly 1 connected component, regardless of OBJECT_AWARE_PROMPTS setting.

### Validation Results

| Metric | Value |
|--------|-------|
| Images Tested | 35 |
| Visual PASS | 33 |
| Visual FAIL | 2 |
| Visual Accuracy | 94.3% |
| Average Latency | 10,528ms |

### Failing Images

| Image | Issue |
|-------|-------|
| flower bouquet | 1 component instead of multiple flowers |
| market spices | 1 component instead of multiple spice packets |

---

## Files Modified

**services/background-remover/providers/gpu_provider.py**
- Improved object-aware prompt detection using edge detection (Sobel) instead of luminance threshold
- Better filtering of significant components (2% min area, edge-dilation, hole-filling)

**services/background-remover/app.py**
- Added /debug/provider endpoint for runtime verification
- Added request ID header propagation
- Added /debug/request/{requestId} trace storage

**services/background-remover/cloudbuild.yaml**
- Deploys to correct service: ai-photo-studio-bg-remover-gpu (not -dbg)
- Added OBJECT_AWARE_PROMPTS=true env var
- Added LOG_LEVEL=info for diagnostics

---

## Cloud Run Revision

**Revision**: ai-photo-studio-bg-remover-gpu-00055-zkg  
**Artifact Digest**: bg-remover@sha256:da1871e12b185e9b18ffac08ef30ef59ba8bdae2564c6d8e70ea6a6870dc2136  
**Frontend Revision**: 8df5839f (Cloudflare Pages)  

---

## Result

**PARTIAL PASS** (94.3% accuracy)

The GPU service is correctly configured with GPUSAM2Provider, but the prompt detection needs improved edge-based detection to identify individual objects in multi-object images. The code changes are ready but require a GPU Docker image rebuild (PyTorch+SAM2) to deploy.
