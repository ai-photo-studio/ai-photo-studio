# OPS-117 — Replicate Forensic Cost Audit (Single Customer Image)

**Date:** 2026-07-23
**Model:** DeepSeek
**Mode:** Code

## Result: VERIFIED

Exactly 3 predictions created for 1 customer image. Zero duplicates. Zero unexpected predictions.

## Cost Breakdown (2.jpeg)

| Stage | Model | GPU sec | Cost |
|---|---|---|---|
| FLUX Restore | flux-kontext-apps/restore-image | 14.96s | $0.0344 |
| GFPGAN face | tencentarc/gfpgan (v1.4) | 2.78s | $0.0064 |
| GFPGAN upscale | tencentarc/gfpgan (scale=2) | 5.89s | $0.0135 |
| **Total** | | **23.63s** | **$0.0543** |

## Prediction Integrity

| Check | Result |
|---|---|
| Expected predictions | 3 |
| Actual predictions | 3 |
| Duplicate predictions | 0 |
| Unexpected predictions | 0 |
| Retries | 0 |
| Polling creates predictions? | NO (GET only) |
| Webhook creates duplicates? | NO (not configured) |

## Batch Support

| Model | Batch Support |
|---|---|
| flux-kontext-apps/restore-image | NO |
| tencentarc/gfpgan | NO |

Neither model supports batch input. Each customer image = exactly 3 predictions.

## Evidence

All artifacts saved to `benchmark/results/ops117/<timestamp>/`.
