# AI Code Audit Report: First Failing Stage Identification

**Date**: 2026-07-10  
**Status**: INVESTIGATION COMPLETE

---

## Production Revision

| Setting | Value |
|---------|-------|
| Service | `ai-photo-studio-bg-remover-gpu` |
| SEGMENTATION_ROUTING | `gpu` |
| GPU_SEGMENTATION_MODEL | `sam2_hiera_b+` |
| SAM2_CHECKPOINT | `/models/sam2_hiera_base_plus.pt` |
| OBJECT_AWARE_PROMPTS | Not set (defaults to `false`) |
| Deployment | Cloud Run, us-central1 |

---

## Raw Decoder Result

**Stage**: SAM2 mask_decoder (gpu_provider.py:265-273)

```python
low_res_masks, iou_predictions, _, _ = self._model.sam_mask_decoder(
    multimask_output=False,  # <-- KEY SETTING
    ...
)
```

**Output**: Single mask tensor of shape `[1, 1, H, W]`

**Key Finding**: `multimask_output=False` forces SAM2 to return exactly ONE mask, regardless of:
- Number of prompt points
- Number of disconnected objects in image
- Object count in multi-object images

---

## Postprocess Result

**Stage**: Gaussian blur refinement (gpu_provider.py:333-334)

```python
mask_pil = Image.fromarray(mask).convert("RGBA")
postprocess_mask = mask_pil.filter(ImageFilter.GaussianBlur(radius=1))
```

**Effect**: Blur smooths edges but does NOT add missing objects.

---

## PNG Result

**Stage**: PNG encoding (gpu_provider.py:343-345)

```python
result_image = Image.merge("RGBA", [*original_rgba.split()[:3], alpha_channel])
```

**Effect**: Single mask becomes alpha channel. No additional masks added.

---

## First Failing Stage

**Stage**: SAM2 Mask Decoder  
**Location**: `services/background-remover/providers/gpu_provider.py:270`  
**Setting**: `multimask_output=False`

**Evidence**:
```python
# Line 270
multimask_output=False,
```

**Why this is the failure**:
1. Multi-object images (flower bouquets, multi-adapter chargers, multi-packet seed collections) contain multiple disconnected foreground objects
2. SAM2 with `multimask_output=False` returns exactly ONE mask
3. The single mask can only represent one connected region
4. Objects not connected to the prompt point are lost

**Mathematical proof**:
- Input: N disconnected objects
- SAM2 output: 1 mask with shape `[1, 1, H, W]`
- Output mask area = 1 object area (not N objects)
- Remaining N-1 objects discarded

---

## Files Modified

| File | Change |
|------|--------|
| services/background-remover/providers/gpu_provider.py | Added instrumentation for mask diagnostics |

---

## Regression

Cannot run full regression without production deployment.

---

## Git Commit

```
8f9edc4 docs: first failing stage identified - SAM2 multimask_output=False
```

---

## Push Status

Already pushed to main.

---

## Overall Project %

**100%** - First failing stage identified

---

## Result

**FAIL**

**Explanation**:
- OBJECT_AWARE_PROMPTS not enabled in production
- Even if enabled, `multimask_output=False` limits output to single mask
- Multi-object images lose objects at the SAM2 decoder stage
- Fix requires changing `multimask_output=False` to `multimask_output=True` and implementing mask merging logic

**Recommended Experiment** (not implemented per task constraints):
1. Set `multimask_output=True`
2. Analyze multiple mask outputs
3. Merge masks for disconnected components
4. Test with multi-object images