# OPS-109 — Head-to-Head Restoration Benchmark

**Date:** 2026-07-23
**Model:** DeepSeek
**Mode:** Code

## Objective

Benchmark two Replicate restoration models head-to-head:

1. **Pipeline A:** flux-kontext-apps/restore-image → GFPGAN → Real-ESRGAN
2. **Pipeline B:** microsoft/bringing-old-photos-back-to-life → GFPGAN → Real-ESRGAN

## Results

See `benchmark/results/ops109/` for full reports.

### Key Findings

| Metric | Pipeline A (FLUX) | Pipeline B (Microsoft) |
|---|---|---|
| Avg Cost/Image | $0.023 | $0.067 |
| Avg Replicate Latency | 13.4s | 32.8s |
| Avg SSIM | 0.58 | 0.59 |
| Avg PSNR | 7.56 | 7.74 |

### Caveat

Replicate account credits were exhausted (~$0.25 limit) before all 7 images × 2 pipelines could complete. Pipeline A completed 3/7 images, Pipeline B completed 5/7 images. LPIPS, face identity score, and scratch removal score require specialized computer vision models not available in the current benchmark infrastructure — recorded as UNKNOWN.