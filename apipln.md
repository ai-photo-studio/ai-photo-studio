# OPS-116 — Production Launch Configuration

## Status

OPS-109 commercial-quality pipeline restored as the default production pipeline.

`RESTORATION_PIPELINE=replicate` → the same 3-stage Replicate pipeline proven in OPS-109.

RunPod local stages (GFPGAN, DDColor, LaMa, Real-ESRGAN via RESTORATION_ENDPOINT_URL) are disabled by default and marked LEGACY_LOCAL_PIPELINE. Re-enable with `RESTORATION_PIPELINE=hybrid` and `RUNPOD_API_KEY` set.

## What Changed

- New `ReplicatePipelineProvider` orchestrates 3 sequential Replicate calls
- `PipelineOrchestrator` default tier is now `replicate` instead of `hd`
- `env.ts` schema extended with `RESTORATION_PIPELINE` enum
- `UnifiedLocalRestorationProvider` marked LEGACY_LOCAL_PIPELINE (code preserved)

## Benchmark Confirmation

Single-image benchmark on `2.jpeg`: SSIM 0.58, PSNR 7.51, $0.0519 — matches OPS-109 commercial quality.
