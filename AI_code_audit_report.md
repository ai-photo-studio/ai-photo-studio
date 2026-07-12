# AI Code Audit Report

## FIRST VERIFIED IMAGE PROCESSING FAILURE

**Location:** `services/background-remover/providers/gpu_provider.py:248-249`

**Root Cause:** The mask inversion logic incorrectly inverts masks when `foreground_ratio < 0.01`, assuming the mask is inverted. But a CORRECT mask with a small object would also have low foreground_ratio, causing incorrect inversion.

**Code:**
```python
foreground_ratio = mask_np.mean()

if foreground_ratio < 0.01:
    mask_np = ~mask_np.astype(bool)

mask_np = (mask_np * 255).astype(np.uint8)
```

**Verification:**
- Tested with simulated SAM2 output (small object, 0.41% coverage)
- `foreground_ratio = 0.0041 < 0.01` triggers inversion
- After inversion, coverage = 99.59% (incorrect)
- Final PNG is almost completely white

**Impact:**
- Correct masks are inverted
- Small objects become large foreground areas
- Returned PNG is almost completely white

**Fix:** Remove or fix the mask inversion logic at lines 248-249

---

## SECONDARY BUG

**Location:** `services/background-remover/providers/gpu_provider.py:253-259`

**Root Cause:** Variable `masks_list` is referenced but never defined.

**Code:**
```python
if self._multi_object:
    logger.warning(f"MULTIOBJ_INFERENCE: mask_count={len(masks_list)}, ...")
    if len(masks_list) > 1:
        weights = [float(iou_predictions[0, 0].item())] * len(masks_list)
        mask_np = self._merge_masks(masks_list, weights)
```

**Impact:**
- NameError when `self._multi_object` is True (default)
- May cause processing failure or silent error

---

## MEASUREMENTS

| Stage | Width | Height | Min | Max | Mean | Coverage % |
|-------|-------|--------|-----|-----|------|------------|
| raw_mask | 1600 | 1200 | 0 | 248 | 13.50 | 0.41% |
| refined_mask | 1600 | 1200 | 0 | 255 | 1.04 | 0.41% |
| alpha_before_inversion | 1600 | 1200 | 0 | 255 | 1.04 | 0.40% |
| alpha (after inversion) | 1600 | 1200 | 0 | 255 | 253.96 | 99.59% |
| final_output | 1600 | 1200 | 0 | 255 | 92.82 | N/A |

---

## FILES MODIFIED

None (analysis only)

---

## COMMANDS EXECUTED

1. `python verify_bug.py` - Verified the mask inversion bug
2. `python phase1_3_reproduce.py` - Reproduced and saved all pipeline stages

---

## BUILD / DEPLOY

Not applicable (analysis only)

---

## BENCHMARK

Not applicable (analysis only)

---

## PASS / FAIL

**FAIL** - First verified image processing failure identified at lines 248-249