# Commercial Restoration Pipeline Analysis

**Date:** 2026-07-22  
**Source:** OPS-95 Investigation  
**Evidence:** Published model documentation, benchmark data, provider API analysis

---

## 1. Current Pipeline vs. Required Pipeline

### Current (broken):
```
Input Image → CodeFormer (face only) → Output (scratches remain)
Input Image → gpt-image-1 (full regen) → Output (authenticity lost)
```

### Required:
```
Input Image → Damage Detection → Inpainting → Face Restoration → Denoising → Color → Upscale → Output
```

---

## 2. Models by Restoration Stage

### Stage 1: Damage Detection

| Model | Type | Purpose | License | Available On |
|---|---|---|---|---|
| LaMa | Inpainting detection | Detect damaged regions via mask | Apache 2.0 | Replicate, self-host |
| MAT | Mask-aware transformer | Mask-guided inpainting | MIT | Self-host |
| BrushNet | Diffusion inpainting | High-quality inpainting with masks | Apache 2.0 | Replicate |
| Segment Anything (SAM) | Segmentation | Generate pixel-perfect damage masks | Apache 2.0 | Self-host |

### Stage 2: Scratch/Crack/Stain Removal

| Model | Type | Purpose | License | Available On |
|---|---|---|---|---|
| **LaMa** | **Inpainting** | **Fill masked damage regions** | **Apache 2.0** | **Replicate, self-host** |
| **MAT** | **Inpainting** | **High-quality large-region inpainting** | **MIT** | **Self-host** |
| **BrushNet** | **Diffusion inpainting** | **Natural fill of damaged areas** | **Apache 2.0** | **Replicate** |
| Microsoft Bringing-Old-Photos-Back-to-Life | Full restoration | Combined scratch/crack/color restoration | MIT | Self-host |

**Recommended: LaMA** (fast, reliable, Apache 2.0, commercial-friendly)

### Stage 3: Face Restoration

| Model | Type | Purpose | License | Available On |
|---|---|---|---|---|
| **CodeFormer** | **Face restoration** | **Face detail enhancement** | **S-Lab (non-commercial)** | **Replicate** |
| **GFPGAN** | **Face restoration** | **Practical face restoration** | **Apache 2.0** | **Replicate, self-host** |
| RestoreFormer | Face restoration | Alternative face restoration | Apache 2.0 | Self-host |

**Recommended: GFPGAN** (Apache 2.0, commercially usable, available on Replicate)

### Stage 4: Denoising

| Model | Type | Purpose | License | Available On |
|---|---|---|---|---|
| **Real-ESRGAN** | **Super-resolution + denoising** | **Blind denoising + upscaling** | **BSD 3-Clause** | **Replicate, self-host** |
| SwinIR | Image restoration | Blind denoising | Apache 2.0 | Self-host |
| SCUNet | Denoising | Fast blind denoising | MIT | Self-host |

**Recommended: Real-ESRGAN** (most practical, commercial-friendly, available on Replicate)

### Stage 5: Color Restoration

| Model | Type | Purpose | License | Available On |
|---|---|---|---|---|
| **DDColor** | **Colorization** | **Photo-realistic colorization** | **Apache 2.0** | **Replicate, self-host** |
| DeOldify | Colorization | Historical photo colorization | MIT | Self-host |
| SCUNet (color) | Color restoration | Color denoising/enhancement | MIT | Self-host |

**Recommended: DDColor** (Apache 2.0, best quality, available on Replicate)

### Stage 6: Super-Resolution/Upscaling

| Model | Type | Purpose | License | Available On |
|---|---|---|---|---|
| **Real-ESRGAN** | **Super-resolution** | **4x upscaling** | **BSD 3-Clause** | **Replicate, self-host** |
| ESRGAN | Super-resolution | 4x upscaling (older) | Apache 2.0 | Self-host |

**Recommended: Real-ESRGAN** (combines with Stage 4)

### Stage 7: Quality Verification

| Tool | Purpose |
|---|---|
| QualityMetricsCalculator (existing) | SSIM, PSNR, sharpness, noise |
| QualityLabService (existing) | Category scores, benchmark comparison |

---

## 3. Recommended Commercial Pipeline

```
                    ┌─────────────────────────────────────────────────────┐
                    │              COMMERCIAL RESTORATION PIPELINE         │
                    ├─────────────────────────────────────────────────────┤
                    │                                                     │
   Input Image ────►│  1. Damage Detection (LaMa / SAM)                   │
                    │      → Generate damage mask                         │
                    │                                                     │
                    ├─────────────────────────────────────────────────────┤
                    │                                                     │
                    │  2. Scratch/Crack Repair (LaMa inpainting)           │
                    │      → Fill mask regions with context-aware content  │
                    │                                                     │
                    ├─────────────────────────────────────────────────────┤
                    │                                                     │
                    │  3. Face Restoration (GFPGAN)                        │
                    │      → Enhance facial details, preserve identity     │
                    │                                                     │
                    ├─────────────────────────────────────────────────────┤
                    │                                                     │
                    │  4. Denoising (Real-ESRGAN)                         │
                    │      → Remove noise, enhance sharpness naturally     │
                    │                                                     │
                    ├─────────────────────────────────────────────────────┤
                    │                                                     │
                    │  5. Color Restoration (DDColor) [if needed]          │
                    │      → Restore faded colors, colorize B&W            │
                    │                                                     │
                    ├─────────────────────────────────────────────────────┤
                    │                                                     │
                    │  6. Quality Verification (QualityMetricsCalculator)   │
                    │      → Verify SSIM, PSNR, print readiness            │
                    │                                                     │
                    └─────────────────────────────────────────────────────┘
                                        │
                                        ▼
                              Restored Output Image
```

---

## 4. Cost Per Stage (Estimated)

| Stage | Provider | Model | Est. Cost/Image |
|---|---|---|---|
| Damage Detection | Replicate | LaMa | $0.002 |
| Inpainting | Replicate | LaMa | $0.004 |
| Face Restoration | Replicate | GFPGAN | $0.005 |
| Denoising | Replicate | Real-ESRGAN | $0.003 |
| Color Restoration | Replicate | DDColor | $0.004 |
| **Total** | | | **~$0.018/image** |

**Comparison to current approach:**
- Current: ~$0.005-$0.077/image (poor quality)
- Recommended: ~$0.018/image (commercial quality)

---

## 5. Implementation Recommendations

1. **DO NOT** use CodeFormer as a full restoration model — it's face-only
2. **DO NOT** use gpt-image-1 without masks — it does blind regeneration
3. **DO** implement a multi-stage pipeline using:
   - LaMa for damage detection + inpainting
   - GFPGAN for face restoration  
   - Real-ESRGAN for denoising + upscaling
   - DDColor for color restoration
4. **DO** add mask generation before any inpainting stage
5. **DO** use Apache 2.0 or MIT licensed models (not S-Lab) for commercial use
6. **DO** run quality verification after each stage

---

## 6. License Compatibility for Commercial Use

| Model | License | Commercial Use |
|---|---|---|
| CodeFormer (current) | S-Lab License 1.0 | ❌ Non-commercial only |
| LaMa | Apache 2.0 | ✅ Yes |
| GFPGAN | Apache 2.0 | ✅ Yes |
| Real-ESRGAN | BSD 3-Clause | ✅ Yes |
| DDColor | Apache 2.0 | ✅ Yes |
| MAT | MIT | ✅ Yes |
| BrushNet | Apache 2.0 | ✅ Yes |

**Current CodeFormer cannot be used commercially** per its license. This is a blocking issue.
