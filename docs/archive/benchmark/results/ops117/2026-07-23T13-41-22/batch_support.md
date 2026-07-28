# Batch Support Analysis

**Date:** 2026-07-23T13:42:17.227Z

## Model: flux-kontext-apps/restore-image

| Property | Value |
|---|---|
| Supports batch | NO |
| Maximum images per request | 1 |
| Billing note | Input schema only accepts single image (img/input_image), no batch field found. |

**Model description:** Use FLUX Kontext to restore, fix scratches and damage, and colorize old photos

**Input schema fields:**
- (schema not available from API)

## Model: tencentarc/gfpgan

| Property | Value |
|---|---|
| Supports batch | NO |
| Maximum images per request | 1 |
| Billing note | Input schema only accepts single image (img/input_image), no batch field found. |

**Model description:** Practical face restoration algorithm for *old photos* or *AI-generated faces*

**Input schema fields:**
- (schema not available from API)

## Conclusion

Neither model supports batch/multi-image input. Each image requires exactly 1 prediction per stage.
Billing is per-prediction: 3 predictions per image = 3× cost per image.
