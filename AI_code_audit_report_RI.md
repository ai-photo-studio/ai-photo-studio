# OPS-116 — Restore OPS-109 Commercial Pipeline as Production Launch Configuration

**Date:** 2026-07-23
**Model:** DeepSeek
**Mode:** Code

## Result: DONE

OPS-109 commercial-quality pipeline restored as production default.

## Feature Flag

`RESTORATION_PIPELINE=replicate` (default) — 3 sequential Replicate calls.

| Value | Pipeline | Status |
|---|---|---|
| `replicate` | flux → gfpgan → upscale (3 Replicate calls) | **ACTIVE (default)** |
| `hybrid` | Flux via Replicate, local via RunPod | LEGACY_LOCAL_PIPELINE (needs RUNPOD_API_KEY) |
| `local` | FLUX Restore only | LEGACY_LOCAL_PIPELINE |

## Benchmark (2.jpeg)

| Metric | OPS-116 | OPS-109 Pipeline A | OPS-112/114 (flux only) |
|---|---|---|---|
| SSIM | 0.58 | 0.58 | 0.56–0.57 |
| PSNR | 7.51 | 7.56 | 7.24–7.29 |
| Cost | $0.0519 | $0.0252 | ~$0.036 |
| Runtime | 46.4s | 96.3s | ~80s |
| Resolution | 4736×3520 | 4736×3520 | 1184×880 |

OPS-116 matches OPS-109 quality (SSIM 0.58, PSNR ~7.5). The prior benchmarks (OPS-112/113/114) showed degraded metrics because local RunPod stages were disabled.

## Changed Files

| File | Change |
|---|---|
| `config/env.ts` | Added `RESTORATION_PIPELINE` env var |
| `providers/ReplicatePipelineProvider.ts` | NEW — 3-stage Replicate pipeline |
| `pipeline/PipelineOrchestrator.ts` | Added `replicate` tier, feature flag routing |
| `factory/ProviderFactory.ts` | Added `replicate-pipeline` provider |
| `providers/UnifiedLocalRestorationProvider.ts` | Marked LEGACY_LOCAL_PIPELINE |

## Evidence

All artifacts saved to `benchmark/results/ops116/2026-07-23T13-11-39/`.
