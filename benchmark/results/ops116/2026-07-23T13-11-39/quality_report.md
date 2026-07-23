# OPS-116 Benchmark — 2.jpeg

**Date:** 2026-07-23T13:12:27.334Z
**Pipeline:** ReplicatePipelineProvider (3 Replicate calls)

## Result

| Metric | Value |
|---|---|
| Total Time | 46434ms |
| Final Resolution | 4736x3520 |
| Total Cost | $0.051900 |
| SSIM (vs original) | 0.58 |
| PSNR (vs original) | 7.51 |
| LPIPS | UNKNOWN |
| Face Similarity | UNKNOWN |
| Stages Executed | flux_restore → gfpgan_face → gfpgan_upscale |

## Comparison with Prior Benchmarks

| Benchmark | Pipeline | SSIM | PSNR |
|---|---|---|---|
| OPS-116 (this run) | flux → gfpgan → upscale (Replicate) | 0.58 | 7.51 |
| OPS-109 Pipeline A | 0.58 | 7.56 |
| OPS-112 (flux only) | 0.56 | 7.24 |
| OPS-114 (flux only) | 0.56 | 7.24 |

## Stage Details

| Stage | Model | Prediction ID | Runtime | Cost |
|---|---|---|---|---|
| 1. Flux Restore | flux-kontext-apps/restore-image | kzkgd1v7wxrmt0czhwd9hmf7sg | ~23217ms | $0.0260 |
| 2. GFPGAN | tencentarc/gfpgan (v1.4) | 9h7752nax9rmw0czhwdb1wy3j0 | ~13930ms | $0.0130 |
| 3. Upscale | tencentarc/gfpgan (scale=2) | pz9bvq6pkxrmy0czhwd99b54w4 | ~9287ms | $0.0130 |