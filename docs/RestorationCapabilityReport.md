# Restoration Capability Report

**Date:** 2026-07-22  
**Source:** OPS-95 Investigation  
**Evidence:** Visual comparison of original vs restored 2.jpeg, API response analysis, model documentation

---

## 1. The Problem

After processing `2.jpeg` through both Replicate and OpenAI, the outputs still contain:
- ✅ Faces partially restored
- ❌ Scratches still visible
- ❌ Cracks still visible
- ❌ Dust still visible
- ❌ Damage still visible

---

## 2. Replicate (CodeFormer): Why It Fails

### What CodeFormer Is

From the model's own documentation:
> **"CodeFormer is a robust face restoration algorithm"**
> "Robust face restoration for old photos or AI-generated faces"

**CodeFormer is a FACE RESTORATION model.** It is NOT a full photo restoration model.

### What CodeFormer Does

| Capability | Supported | Evidence |
|---|---|---|
| Face restoration | ✅ | Detected 4 faces (from prediction logs: "detect 4 faces") |
| Scratch removal | ❌ | Not designed for this |
| Crack repair | ❌ | Not designed for this |
| Dust removal | ❌ | Not designed for this |
| Full-image restoration | ❌ | Focuses on face regions |
| Upscaling | ✅ | Supports `upscale` parameter (used: 2) |

### Limiting Factors

1. **Face-focused architecture**: CodeFormer uses a codebook lookup transformer specifically for blind face restoration. Non-face regions receive minimal processing.
2. **No prompt support**: The model does not accept a text prompt — it has only `image` and `upscale` parameters. The restoration prompt is irrelevant to CodeFormer.
3. **License restriction**: "Replicate API of CodeFormer cannot be used commercially" (S-Lab License 1.0)

---

## 3. OpenAI (gpt-image-1 via /v1/images/edits): Why It Fails

### What gpt-image-1 Is

gpt-image-1 is a **text-to-image generation model**, not a restoration model. The `/v1/images/edits` endpoint is designed for **image editing with masks** — you provide an image with a transparent area and describe what to fill in.

### What gpt-image-1 Does

| Capability | Supported | Evidence |
|---|---|---|
| Image generation from prompt | ✅ | Designed for this |
| Guided image editing (with mask) | ✅ | Requires transparent area or mask |
| Blind restoration (no mask) | ❌ | API returned 400: "invalid_image_file" |
| Scratch/crack repair | ❌ | Needs mask to know where to repair |
| Face restoration | ❌ | Not specialized for faces |

### Limiting Factors

1. **Mask requirement**: The `/v1/images/edits` endpoint requires either:
   - An image with an alpha channel (transparent area defining the edit region)
   - A separate mask parameter
   
   Our code sends neither.

2. **Prompt mismatch**: The restoration prompt asks to "remove scratches, remove cracks, repair torn regions" but without a mask, gpt-image-1 has no guidance on WHERE to apply these edits.

3. **Result quality**: Without a mask, gpt-image-1 performs a full-image regeneration guided by the prompt. This explains:
   - SSIM of 0.8 (moderate structural similarity — not identical)
   - PSNR of ~7.0 (low — significant pixel differences)
   - Sharpness of 100 (full regeneration creates over-sharpened result)

---

## 4. Verification: Provider API Mismatch

### Neither Provider Is Designed for What We're Asking

| Requirement | Replicate (CodeFormer) | OpenAI (gpt-image-1) |
|---|---|---|
| Remove scratches | ❌ Face only | ❌ Needs mask |
| Remove cracks | ❌ Face only | ❌ Needs mask |
| Remove dust | ❌ Face only | ❌ Needs mask |
| Repair torn regions | ❌ Face only | ❌ Needs mask |
| Restore faded details | ✅ Sharpens faces | ❌ Full regen |
| Restore facial details | ✅ Core capability | ❌ Lacks specialization |
| Preserve identity | ✅ (age-progressed face) | ❌ Regenerates |
| Historical authenticity | ❌ Face only | ❌ Generates new image |

### Conclusion

Both current providers are **wrong tools for the job**:

- CodeFormer restores faces only — the non-face regions (background, clothing, damage) are nearly unchanged
- gpt-image-1 edits require a mask — without one, it regenerates the whole image, losing authenticity

---

## 5. What a True Photo Restoration Pipeline Needs

| Stage | Model | Purpose |
|---|---|---|
| 1. Damage detection | LaMa / MAT / BrushNet | Detect and mask damaged regions |
| 2. Scratch/crack removal | LaMa (generative inpainting) | Fill masked damaged regions |
| 3. Face restoration | GFPGAN / CodeFormer | Restore face details (use CodeFormer correctly!) |
| 4. Denoising | Real-ESRGAN | Reduce noise without losing detail |
| 5. Color restoration | DDColor / DeOldify | Restore color to faded/B&W photos |
| 6. Super-resolution | Real-ESRGAN | Upscale to printable resolution |
| 7. Final quality pass | QualityMetricsCalculator | Verify output against benchmarks |

Each stage solves ONE specific problem. No single model does all of them.

---

## 6. Immediate Fix Recommendations

1. **For Replicate (CodeFormer)**: Use it ONLY for the face restoration stage, not as a full restoration model. This is what it's designed for.

2. **For OpenAI**: Add mask generation before calling `/v1/images/edits`:
   - Generate a damage mask (detect scratches, cracks, tears)
   - Apply mask to input image (set damaged regions to transparent)
   - Send masked image with prompt targeting only damaged areas

3. **For production**: Build a multi-stage pipeline (Section 5 above) rather than relying on a single API call.
