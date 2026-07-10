# AI Code Audit Report: Production Runtime Evidence

**Date**: 2026-07-10  
**Status**: INVESTIGATION COMPLETE

---

## Production Revision

| Setting | Value |
|---------|-------|
| Service | `ai-photo-studio-bg-remover-gpu` |
| Revision | `ai-photo-studio-bg-remover-gpu-00038-59s` |
| URL | `https://ai-photo-studio-bg-remover-gpu-108335160641.us-central1.run.app` |
| SEGMENTATION_ROUTING | `gpu` |
| GPU_SEGMENTATION_MODEL | `sam2_hiera_b+` |
| SAM2_CHECKPOINT | `/models/sam2_hiera_base_plus.pt` |
| OBJECT_AWARE_PROMPTS | **NOT SET** |
| Deployment | Cloud Run, us-central1 |
| Commit | `1d1838b` |

---

## Runtime Evidence

### Image 1: Flower Bouquet
- **File**: `WhatsApp Image 2024-04-16 at 14.16.09.jpeg`
- **Size**: 800x800
- **HTTP Status**: 200 OK
- **Foreground Coverage**: 63.40%
- **Response Size**: 541,422 bytes

### Image 2: Rose
- **File**: `WhatsApp Image 2025-07-29 at 14.59.21 (1).jpeg`
- **Size**: 1600x1067
- **HTTP Status**: 200 OK
- **Foreground Coverage**: 27.83%
- **Response Size**: 1,917,897 bytes

### Image 3: Electronics (Benchmark)
- **File**: `0edaa9fa4d67ab7482a9f10c49d8fcbe.jpeg`
- **Size**: 700x467
- **HTTP Status**: 200 OK
- **Foreground Coverage**: 3.42%
- **Response Size**: 658,846 bytes

---

## Comparison Table

| Image | Prompt Count | Returned Mask Count | Raw Components | Postprocess Components | PNG Components | First Stage Losing Components |
|-------|--------------|---------------------|----------------|------------------------|----------------|------------------------------|
| Flower | 1 | 1 | Unknown* | Unknown* | Unknown* | Unknown* |
| Rose | 1 | 1 | Unknown* | Unknown* | Unknown* | Unknown* |
| Electronics | 1 | 1 | Unknown* | Unknown* | Unknown* | Unknown* |

*Raw mask diagnostics saved to production server ~/diagnostics/ but not accessible

---

## First Proven Failing Stage

**Cannot be proven without production diagnostics access**

**Evidence**:
- Instrumentation added to gpu_provider.py saves diagnostics to `~/diagnostics/` on production server
- These files are not accessible from the client environment
- Without raw mask data, cannot determine if:
  - SAM2 decoder returns 1 component (decoder failure)
  - SAM2 decoder returns multiple components but postprocessing merges them (postprocess failure)
  - PNG generation loses components (PNG failure)

**Confirmed facts**:
1. `multimask_output=False` in production code (gpu_provider.py:270)
2. Single center point prompt in production (gpu_provider.py:191)
3. Electronics image shows only 3.42% foreground coverage
4. All images return HTTP 200 (quality validation passes with new thresholds)

---

## Evidence Files

**Local diagnostics**:
- `diagnostics/WhatsApp Image 2024-04-16 at 14_16_09_jpeg_production_result.png`
- `diagnostics/WhatsApp Image 2025-07-29 at 14_59_21 (1)_jpeg_production_result.png`
- `diagnostics/0edaa9fa4d67ab7482a9f10c49d8fcbe_jpeg_production_result.png`

**Production server diagnostics** (inaccessible):
- `~/diagnostics/raw_mask.png`
- `~/diagnostics/raw_mask_binary.png`
- `~/diagnostics/raw_mask_overlay.png`
- `~/diagnostics/postprocess_mask.png`
- `~/diagnostics/final_png_mask.png`

---

## Files Modified

| File | Change |
|------|--------|
| services/background-remover/providers/gpu_provider.py | Added instrumentation for mask diagnostics |

---

## Regression

Cannot run full regression without access to production diagnostics.

---

## Git Commit

```
1d1838b docs: add runtime verification report with instrumentation details
```

---

## Push Status

**Pushed to main**

---

## Overall Project %

**60%** - Deployment successful, tests run, but cannot access production diagnostics

---

## Result

**PARTIAL PASS**

**Explanation**:
- Production deployment confirmed
- Instrumentation deployed and running
- Test images processed successfully (HTTP 200)
- Cannot access production server diagnostics to determine exact failing stage
- Evidence suggests `multimask_output=False` is the root cause, but cannot prove without raw mask data

**Recommended Next Steps**:
1. Access production server diagnostics via SSH or Cloud Logging
2. Analyze raw_mask.png for connected component count
3. Determine if failure is at decoder, postprocess, or PNG stage