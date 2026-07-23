# OPS-115 Provider Routing Audit

## OPS-109 Provider Routing (Direct Replicate)

| Stage | Provider | Transport | Model | Endpoint | Executed? |
|---|---|---|---|---|---|
| Flux Restore | FluxRestoreProvider | Replicate API | flux-kontext-apps/restore-image | POST /v1/models/.../predictions | YES |
| GFPGAN | GFPGANProvider | Replicate API | tencentarc/gfpgan | POST /v1/models/.../predictions | YES |
| Real-ESRGAN | GFPGANProvider (reused) | Replicate API | tencentarc/gfpgan (scale param) | POST /v1/models/.../predictions | YES |

## Current Provider Routing (OPS-108 Hybrid)

| Stage | Provider | Transport | Model / Endpoint | Required Env | Executed? |
|---|---|---|---|---|---|
| Flux Restore | FluxRestoreProvider | Replicate API | flux-kontext-apps/restore-image | REPLICATE_API_TOKEN | YES |
| GFPGAN | RestorationGfpganService → UnifiedRestorationService → postImage → isRunPodEndpointId → runViaRunPod | RunPod | RESTORATION_ENDPOINT_URL=3z633s11yn4n8q | RESTORATION_ENDPOINT_URL + RUNPOD_API_KEY | NO (RunPod auth fails) |
| Real-ESRGAN | RealEsrganService → checks REAL_ESRGAN_URL | HTTP (if URL set) / RunPod | REAL_ESRGAN_URL endpoint | REAL_ESRGAN_URL | NO (empty → passthrough) |
| DDColor | RestorationDdcolorService → UnifiedRestorationService → postImage → isRunPodEndpointId → runViaRunPod | RunPod | RESTORATION_ENDPOINT_URL=3z633s11yn4n8q | RESTORATION_ENDPOINT_URL + RUNPOD_API_KEY | NO (RunPod auth fails) |
| LaMa | RestorationInpaintService → UnifiedRestorationService → postImage → isRunPodEndpointId → runViaRunPod | RunPod | RESTORATION_ENDPOINT_URL=3z633s11yn4n8q | RESTORATION_ENDPOINT_URL + RUNPOD_API_KEY | NO (RunPod auth fails) |

## Root Cause

OPS-109 achieved commercial quality by using **3 separate Replicate calls** for the full pipeline:

1. `flux-kontext-apps/restore-image` — initial restoration
2. `tencentarc/gfpgan` — face enhancement (GFPGAN)
3. `tencentarc/gfpgan` with scale=2 — upscaling (acting as Real-ESRGAN)

The current OPS-108 hybrid architecture routes stages 2-4 through **RunPod** via a single unified endpoint (`RESTORATION_ENDPOINT_URL=3z633s11yn4n8q`). However, `runViaRunPod()` at `restoration-provider.service.ts:87-89` requires `RUNPOD_API_KEY`, which is not set in any environment.

The provider transport path changed from:
```
OPS-109: Replicate → Replicate → Replicate (all work via one API token)
Current:  Replicate → RunPod → HTTP → RunPod → RunPod (needs 2+ credentials)
```

## Missing Credentials Summary

| Required Credential | Set in .env.project.example | Set in northflank.json | Set in GitHub Secrets | Set in .env.local | Set in process.env |
|---|---|---|---|---|---|
| REPLICATE_API_TOKEN | YES (r8_cJuo...) | NO (secrets list) | NO (deploy.yml) | NO | NO (current session) |
| RUNPOD_API_KEY | NO (REPLACE_WITH) | YES (secrets list) | NO | NO | NO |
| RESTORATION_ENDPOINT_URL | YES (3z633s11yn4n8q) | YES (3z633s11yn4n8q) | NO | NO | NO |
| REAL_ESRGAN_URL | YES (thannow.com placeholder) | NO | NO | NO | NO |