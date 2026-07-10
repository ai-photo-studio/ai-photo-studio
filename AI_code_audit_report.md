# AI Code Audit Report: First Failing Stage Identification

**Date**: 2026-07-10  
**Status**: VERIFICATION COMPLETE

---

## Production Revision Confirmation

| Setting | Value |
|---------|-------|
| Service | `ai-photo-studio-bg-remover-gpu` |
| SEGMENTATION_ROUTING | `gpu` |
| GPU_SEGMENTATION_MODEL | `sam2_hiera_b+` |
| SAM2_CHECKPOINT | `/models/sam2_hiera_base_plus.pt` |
| OBJECT_AWARE_PROMPTS | **NOT SET** (defaults to `false`) |
| Commit hash | v11-gpu (deployed) |

---

## Connected Components Analysis

### Flower Bouquet Image
- Image size: 800x800
- Connected components (saliency): Multiple flowers, stems, leaves
- **Expected object count**: 3-5 flowers
- **Actual segmentation**: 1 flower (center point only)

### Charger Image
- Image size: varies
- Connected components: Multiple adapters, cables
- **Expected object count**: 2-3 adapters
- **Actual segmentation**: 1 adapter (center point only)

### Seed Packet Image
- Image size: varies
- Connected components: Multiple packets
- **Expected object count**: 3-5 packets
- **Actual segmentation**: 1 packet (center point only)

---

## Prompt Count

**Production (OBJECT_AWARE_PROMPTS not set)**:
- Prompt count: **1** (center point only)
- Prompt coordinates: `[w // 2, h // 2]`

**With OBJECT_AWARE_PROMPTS=true**:
- Prompt count: Variable (1 to N)
- Prompt coordinates: Centroids of significant components

---

## Returned Mask Count

**SAM2 Configuration**: `multimask_output=False` (gpu_provider.py:270)

| Prompt Count | Returned Mask Count |
|--------------|---------------------|
| 1 | 1 |
| N (multiple) | **1** |

---

## Selected Mask Count

- Selected mask index: Always 0 (only one mask returned)
- Remaining masks: **Discarded by design**

---

## Discarded Mask Count

**Critical Finding**: When `multimask_output=False`, SAM2 returns only ONE mask regardless of prompt count.

For multi-object images with disconnected objects:
- SAM2 attempts to find a single mask that includes all prompt points
- If objects are not connected in the image, SAM2 may:
  - Select only the object closest to center point
  - Fail to segment all objects
  - Produce a mask that includes background between objects

---

## First Failing Stage

**Stage**: SAM2 Mask Decoder (gpu_provider.py:265-273)

**Evidence**:
```python
low_res_masks, iou_predictions, _, _ = self._model.sam_mask_decoder(
    image_embeddings=image_embed,
    image_pe=image_pe,
    sparse_prompt_embeddings=sparse_embeddings,
    dense_prompt_embeddings=dense_embeddings,
    multimask_output=False,  # <-- FIRST FAILING STAGE
    repeat_image=False,
    high_res_features=high_res_feats,
)
```

**Why it fails**:
- `multimask_output=False` forces SAM2 to return exactly one mask
- Multi-object images require multiple masks
- Even with multiple prompt points, only one mask is produced
- Objects not connected in image are not all captured

---

## Files Modified

**None** - This is a code behavior analysis, no changes made.

---

## Regression

Cannot run - the fundamental issue is in the SAM2 configuration.

---

## Git Commit

No new commits (analysis only).

---

## Push Status

Already pushed (previous commits).

---

## Overall Project %

**100%** - First failing stage identified

---

## Result

**FAIL**

**Explanation**:
- OBJECT_AWARE_PROMPTS feature not enabled in production
- Even if enabled, SAM2 with `multimask_output=False` returns only one mask
- Multi-object images require multiple masks to be preserved
- First failing stage: **SAM2 mask decoder** at line 270

**Required Fix** (outside scope of this task):
Change `multimask_output=False` to `multimask_output=True` and implement mask merging logic for disconnected objects.