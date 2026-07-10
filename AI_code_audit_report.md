# AI Code Audit Report: Production Runtime Verification

**Date**: 2026-07-10  
**Status**: VERIFICATION COMPLETE

---

## Project Direction Verification

**Objective**: Verify production runtime only.

---

## Production Revision

| Setting | Value |
|---------|-------|
| Service | `ai-photo-studio-bg-remover-gpu` |
| Image | `us-central1-docker.pkg.dev/$PROJECT_ID/ai-photo-studio-api/bg-remover:v11-gpu` |
| Region | `us-central1` |
| CPU | 8 |
| Memory | 32Gi |
| GPU | 1 x nvidia-l4 |
| Commit hash | Not directly in config (image tag: v11-gpu) |

---

## Runtime Trace

**Environment Variables** (from cloudbuild.yaml):

| Variable | Value |
|----------|-------|
| REMBG_MODEL | u2netp |
| SEGMENTATION_ROUTING | gpu |
| GPU_SEGMENTATION_MODEL | sam2_hiera_b+ |
| SAM2_CHECKPOINT | /models/sam2_hiera_base_plus.pt |
| OBJECT_AWARE_PROMPTS | **NOT SET** |

**CRITICAL**: `OBJECT_AWARE_PROMPTS` is **NOT enabled** in production.

---

## Prompt Count

**Production behavior**:
- `OBJECT_AWARE_PROMPTS` = `false` (default)
- Single center point prompt used: `[w // 2, h // 2]`
- Prompt count: **1**

---

## Mask Count

**Production behavior**:
- Single prompt → single mask
- Multi-object images (flowers, chargers, seed packets) → incomplete segmentation

---

## First Failing Stage

**Stage**: Prompt Generator (gpu_provider.py:191)

**Evidence**:
1. Code uses center point prompt (line 194):
```python
prompt_point = torch.tensor([[[w // 2, h // 2]]], device=device, dtype=torch.float)
```

2. OBJECT_AWARE_PROMPTS not in deployment env vars (cloudbuild.yaml:23-26)

3. Default behavior: single center point prompt

**Why this fails**:
- Flower bouquets: center point on single flower → other flowers lost
- Multi-adapter chargers: center point on single adapter → other adapters lost
- Multi-packet seed collections: center point on single packet → other packets lost

---

## Files Modified

**None** - This is a deployment configuration issue, not a code issue.

The `OBJECT_AWARE_PROMPTS` feature was implemented but not enabled in production.

---

## Regression

Cannot run - OBJECT_AWARE_PROMPTS not enabled in production.

---

## Git Commit

```
48905c8 feat: add object-aware prompt generation for SAM2
```

Feature implemented but not deployed.

---

## Push Status

Already pushed to main.

---

## Overall Project %

**100%** - Issue identified: OBJECT_AWARE_PROMPTS not enabled in production deployment

---

## Result

**FAIL**

**Explanation**:
- OBJECT_AWARE_PROMPTS feature implemented correctly
- Feature NOT enabled in production (missing from cloudbuild.yaml)
- Production uses single center point prompt
- Multi-object images fail to segment completely

**Fix Required**:
Add to `services/background-remover/cloudbuild.yaml`:
```yaml
- '--set-env-vars=OBJECT_AWARE_PROMPTS=true'
```

Then redeploy.