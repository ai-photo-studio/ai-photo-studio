# OPS-113 — Hybrid Pipeline Stage Verification

**Date:** 2026-07-23
**Model:** DeepSeek
**Mode:** Code

## Result

The commercial-quality Pipeline A is **not reproduced** because the local post-processing stages (GFPGAN, Real-ESRGAN, DDColor, LaMa) never execute. The pipeline degenerates to a single Replicate call.

## Root Cause

| Stage | Env Var Missing | Source Location | Why Skipped |
|---|---|---|---|
| GFPGAN | RUNPOD_API_KEY | restoration-provider.service.ts:88-89 | RESTORATION_ENDPOINT_URL resolves to RunPod endpoint ID, but runViaRunPod requires RUNPOD_API_KEY |
| DDColor | RUNPOD_API_KEY | restoration-provider.service.ts:88-89 | Same RunPod transport failure; also image is not grayscale |
| LaMa | RUNPOD_API_KEY | restoration-provider.service.ts:88-89 | Same RunPod transport failure; scratch=47% >15% threshold would trigger if RunPod worked |
| Real-ESRGAN | REAL_ESRGAN_URL | real-esrgan.service.ts:27-33 | Empty URL → pass-through mode (returns source unchanged) |

## Pipeline Executed

FLUX Restore (Replicate, flux-kontext-apps/restore-image) → passthrough (all 4 local stages skipped)

## Comparison with Pipeline A (OPS-109)

| Metric | Current (OPS-113) | Pipeline A (OPS-109) |
|---|---|---|
| SSIM vs original | 0.57 | 0.58 |
| PSNR vs original | 7.29 | 7.56 |
| Stages executed | FLUX Restore only | FLUX Restore + GFPGAN + Real-ESRGAN (all Replicate) |

## Evidence

All artifacts saved to `benchmark/results/ops113/2026-07-23T11-53-11/`:
- Intermediate images: 01-08
- Stage trace: `10_stage_trace.json`
- Metrics: `09_metrics.json`
- Verification report: `15_verification.md`
- Environment audit: `20_environment.json`

## Fix Required

Set `RUNPOD_API_KEY` and `REAL_ESRGAN_URL` in the benchmark/production environment.
