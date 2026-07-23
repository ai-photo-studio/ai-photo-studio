# OPS-111 Verification Report

**Date:** 2026-07-23T10:34:08.402Z
**Image:** old images/2.jpeg
**Pipeline:** flux-restore (Replicate) → unified-local
**Replicate Credits:** AVAILABLE

## Verification Results

| PASS | 01_original.jpg saved |
| FAIL | 02_flux_restore.png saved |
| PASS | 07_final_output.png saved |
| PASS | 08_side_by_side.png saved |
| PASS | 09_metrics.json saved |
| PASS | 10_pipeline_trace.json saved |
| PASS | 11_provider_trace.json saved |
| PASS | 12_request.json saved |
| PASS | 13_response.json saved |
| PASS | 14_headers.json saved |
| PASS | 15_prediction.json saved |
| PASS | 16_runtime.json saved |
| PASS | 17_cost.json saved |
| PASS | 18_manifest.json saved |
| PASS | 19_sha256.txt saved |
| PASS | 20_environment.json saved |
| PASS | Exactly 1 Replicate call |

## Runtime Summary

Total runtime: 1109ms
Replicate runtime: UNKNOWNms
Local runtime: 2ms
Replicate cost: $UNKNOWN
Local cost: $0.00
Total cost: $UNKNOWN

## Quality Summary

| Metric | Value |
|---|---|
| SSIM | 1 |
| PSNR | 50 |
| Sharpness | 100 |
| Noise | 100 |
| Contrast | 100 |
| Brightness | 100 |
| Print Quality | 100 |
| LPIPS | UNKNOWN |
| Face Identity | UNKNOWN |
| Scratch Removal | UNKNOWN |

Original: 525x380 (38247 bytes)
Final: 525x380 (38247 bytes)

## Stage Execution

- **02_unified_local**: 2ms → 0x0 (37KB)