# OPS-115 — Root Cause Analysis

## Why OPS-109 quality is not reproduced

**Architecture difference:** OPS-109 benchmark bypassed the local service pipeline entirely. It made 3 direct Replicate HTTP API calls sequentially:
1. `flux-kontext-apps/restore-image` (initial restoration)
2. `tencentarc/gfpgan` (face enhancement)
3. `tencentarc/gfpgan` with scale=2 (upscaling as Real-ESRGAN proxy)

All three use the same `REPLICATE_API_TOKEN` via the same `BaseReplicateProvider` HTTP transport.

**Current architecture (OPS-108):** Routes stages 2-4 through RunPod via `RESTORATION_ENDPOINT_URL=3z633s11yn4n8q`. The transport function `runViaRunPod()` at `restoration-provider.service.ts:87-89` requires `RUNPOD_API_KEY`, which is not set in .env.local, process.env, or any audited environment source.

## Road to recovery

Option A: Set `RUNPOD_API_KEY` and `REAL_ESRGAN_URL` — RunPod unified endpoint handles all local stages.
Option B: Revert to direct Replicate calls for GFPGAN and upscaling using `GFPGANProvider` as in OPS-109.
