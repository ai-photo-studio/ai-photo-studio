# OPS-115 — Reproduce OPS-109 Commercial Pipeline Environment

**Date:** 2026-07-23
**Model:** DeepSeek
**Mode:** Code

## Finding: OPS-109 used 3 separate Replicate calls. Current pipeline routes through RunPod but RUNPOD_API_KEY is missing.

## Environment Diff
- Sources audited: .env.project.example, .env.local, northflank.json, deploy.yml, process.env
- Full variable comparison table: `benchmark/results/ops115/<timestamp>/environment_diff.md`

## Provider Routing Difference

| Stage | OPS-109 Provider | Current Provider | OPS-109 | Current |
|---|---|---|---|---|
| Flux Restore | FluxRestoreProvider (Replicate) | FluxRestoreProvider (Replicate) | EXECUTED | EXECUTED |
| GFPGAN | GFPGANProvider (Replicate, tencentarc/gfpgan) | RestorationGfpganService (RunPod) | EXECUTED | SKIPPED (RUNPOD_API_KEY missing) |
| Real-ESRGAN | GFPGANProvider (Replicate, scale=2) | RealEsrganService (REAL_ESRGAN_URL) | EXECUTED | SKIPPED (URL empty) |
| DDColor | Not used | RestorationDdcolorService (RunPod) | N/A | SKIPPED |
| LaMa | Not used | RestorationInpaintService (RunPod) | N/A | SKIPPED |

## Root Cause
OPS-109 used the same Replicate API token for all 3 stages. The current architecture routes GFPGAN/DDColor/LaMa through RunPod via `RESTORATION_ENDPOINT_URL=3z633s11yn4n8q`, which requires `RUNPOD_API_KEY` — not set in any environment. Real-ESRGAN needs `REAL_ESRGAN_URL` — also unset.

## Fix
Set `RUNPOD_API_KEY` for RunPod transport, and `REAL_ESRGAN_URL` for Real-ESRGAN endpoint.
