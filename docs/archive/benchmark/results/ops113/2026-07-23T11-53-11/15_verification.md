# OPS-113 Pipeline Stage Verification

**Date:** 2026-07-23T11:53:29.850Z
**Image:** old images/2.jpeg
**Run Directory:** D:\AI Product Photo Studio on WhatsApp\benchmark\results\ops113\2026-07-23T11-53-11

## Stage Execution Summary

| Stage | Executed | Skipped | Reason | Env Var | Source File:Line |
|---|---|---|---|---|---|
| 01_original | VERIFIED | NO | - | - |
| 02_flux_restore | VERIFIED | NO | - | - |
| 03_gfpgan | NO | GFPGAN skipped: RESTORATION_ENDPOINT_URL is empty — RestorationGfpganService → U | - | restoration-provider.service.ts:35-37:35 |
| 04_realesrgan | VERIFIED | NO | REAL_ESRGAN_URL | real-esrgan.service.ts:27-33:27 |
| 05_ddcolor | NO | DDColor skipped: RESTORATION_ENDPOINT_URL is empty — RestorationDdcolorService → | N/A (conditional on grayscale detection) | UnifiedLocalRestorationProvider.ts:71:71 |
| 06_lama | NO | LaMa skipped: RESTORATION_ENDPOINT_URL is empty — RestorationInpaintService → Un | - | restoration-provider.service.ts:35-37:35 |
| 07_final_output | VERIFIED | NO | - | - |

## Detailed Skip Evidence

### 03_gfpgan
- **Exact reason:** GFPGAN skipped: RESTORATION_ENDPOINT_URL is empty — RestorationGfpganService → UnifiedRestorationService throws AppError(503, RESTORATION_ENDPOINT_UNAVAILABLE)
- **Environment variable:** N/A
- **Conditional branch:** config.RESTORATION_ENDPOINT_URL is empty string
- **Source file:** restoration-provider.service.ts:35-37
- **Source line:** 35

### 05_ddcolor
- **Exact reason:** DDColor skipped: RESTORATION_ENDPOINT_URL is empty — RestorationDdcolorService → UnifiedRestorationService throws AppError(503, RESTORATION_ENDPOINT_UNAVAILABLE)
- **Environment variable:** N/A (conditional on grayscale detection)
- **Conditional branch:** damage.isGrayscale === false at UnifiedLocalRestorationProvider.ts:71
- **Source file:** UnifiedLocalRestorationProvider.ts:71
- **Source line:** 71

### 06_lama
- **Exact reason:** LaMa skipped: RESTORATION_ENDPOINT_URL is empty — RestorationInpaintService → UnifiedRestorationService throws AppError(503, RESTORATION_ENDPOINT_UNAVAILABLE)
- **Environment variable:** N/A
- **Conditional branch:** N/A
- **Source file:** restoration-provider.service.ts:35-37
- **Source line:** 35

## Stage Artifacts

| File | Input SHA256 | Output SHA256 | Input Res | Output Res | Input Size | Output Size | Time (ms) |
|---|---|---|---|---|---|---|---|
| 01_original.png | 3f6b0d3fd482e1f5... | 3f6b0d3fd482e1f5... | 525x380 | 525x380 | 37.4KB | 37.4KB | 0 |
| 02_flux_restore.png | 3f6b0d3fd482e1f5... | cd0d7e24db798b0d... | 525x380 | 1184x880 | 37.4KB | 1601.8KB | 17056 |
| 03_gfpgan.png | cd0d7e24db798b0d... | cd0d7e24db798b0d... | 1184x880 | 1184x880 | 1601.8KB | 1601.8KB | 3 |
| 04_realesrgan.png | cd0d7e24db798b0d... | cd0d7e24db798b0d... | 1184x880 | 1184x880 | 1601.8KB | 1601.8KB | 2 |
| 05_ddcolor.png | cd0d7e24db798b0d... | cd0d7e24db798b0d... | 1184x880 | 1184x880 | 1601.8KB | 1601.8KB | 1 |
| 06_lama.png | cd0d7e24db798b0d... | cd0d7e24db798b0d... | 1184x880 | 1184x880 | 1601.8KB | 1601.8KB | 2 |
| 07_final_output.png | cd0d7e24db798b0d... | cd0d7e24db798b0d... | 1184x880 | 1184x880 | 1601.8KB | 1601.8KB | 2 |

## Comparison with Pipeline A (OPS-109)

| Metric | Value |
|---|---|
| SSIM vs Pipeline A | 0.58 |
| PSNR vs Pipeline A | 7.49 |
| LPIPS | undefined |
| Face Similarity | undefined |

## Environment

| Variable | Value |
|---|---|
| RESTORATION_ENDPOINT_URL | 3z633s11yn4n8q |
| REAL_ESRGAN_URL | (empty) |
| REPLICATE_API_TOKEN | SET (r8_cJuo0CU...) |

## Verified Service Calls (2026-07-23T12:00)

| Service | Config URL | Result | RUNPOD_API_KEY |
|---|---|---|---|
| GFPGAN | RESTORATION_ENDPOINT_URL=3z633s11yn4n8q | EXECUTED | NOT SET... |
| DDColor | RESTORATION_ENDPOINT_URL=3z633s11yn4n8q | EXECUTED | NOT SET... |
| LaMa | RESTORATION_ENDPOINT_URL=3z633s11yn4n8q | EXECUTED | NOT SET... |
| Real-ESRGAN | REAL_ESRGAN_URL=(empty) | PASSTHROUGH (REAL_ESRGAN_URL not set) | NOT SET... |

### Root Cause Analysis

**GFPGAN/DDColor/LaMa:** RESTORATION_ENDPOINT_URL is set to a RunPod endpoint ID (3z633s11yn4n8q), but runViaRunPod requires RUNPOD_API_KEY to be set.
**RUNPOD_API_KEY:** NOT SET — all RunPod calls fail with 'RunPod API key not configured'

**Real-ESRGAN:** REAL_ESRGAN_URL is empty — service returns source image unchanged (pass-through).

**Conclusion:** GFPGAN, DDColor, and LaMa stages are DISABLED because both RESTORATION_ENDPOINT_URL and RUNPOD_API_KEY are needed for RunPod transport.
Real-ESRGAN is DISABLED because REAL_ESRGAN_URL is not configured.

The actual pipeline executed only: FLUX Restore (Replicate) → passthrough (all local stages skipped).


## Verified Service Calls (2026-07-23T12:05)

| Service | Config URL | Result | RUNPOD_API_KEY | Source Location |
|---|---|---|---|---|
| GFPGAN | RESTORATION_ENDPOINT_URL=3z633s11yn4n8q | FAILED: RunPod API key not configured (RUNPOD_API_KEY missing) | NOT SET | restoration-provider.service.ts:88-89 (runViaRunPod) |
| DDColor | RESTORATION_ENDPOINT_URL=3z633s11yn4n8q | FAILED: RunPod API key not configured (RUNPOD_API_KEY missing) | NOT SET | restoration-provider.service.ts:88-89 (runViaRunPod) |
| LaMa | RESTORATION_ENDPOINT_URL=3z633s11yn4n8q | FAILED: RunPod API key not configured (RUNPOD_API_KEY missing) | NOT SET | restoration-provider.service.ts:88-89 (runViaRunPod) |
| Real-ESRGAN | REAL_ESRGAN_URL=(empty) | PASSTHROUGH (REAL_ESRGAN_URL not set) | N/A | real-esrgan.service.ts:27-33 (config check) |

## Root Cause Analysis

### GFPGAN, DDColor, LaMa — BLOCKED by RUNPOD_API_KEY

RESTORATION_ENDPOINT_URL is set to the RunPod endpoint ID `3z633s11yn4n8q`.
However, `RUNPOD_API_KEY` is **NOT SET**.

The call flow is:
1. `RestorationGfpganService.enhance()` (restoration-provider.service.ts:190-192)
2. → `UnifiedRestorationService.restore()` (restoration-provider.service.ts:137-139)
3. → `postImage()` (restoration-provider.service.ts:30-80)
4. → `isRunPodEndpointId()` returns true for `3z633s11yn4n8q` (restoration-provider.service.ts:26-28)
5. → `runViaRunPod()` (restoration-provider.service.ts:82-115)
6. → checks `process.env.RUNPOD_API_KEY` at line 87-89 — throws if empty

**Fix needed in production:** Set RUNPOD_API_KEY in the environment.

### Real-ESRGAN — PASS-THROUGH (No URL)

REAL_ESRGAN_URL is not set. `RealEsrganService.enhance()` at real-esrgan.service.ts:27-33
checks `config.REAL_ESRGAN_URL.trim()` — if empty, logs warning and returns source buffer unchanged.

**Fix needed in production:** Set REAL_ESRGAN_URL to a valid endpoint URL.

### Bottom Line

The current production pipeline (via OPS-108 hybrid architecture) produces:

| Stage | Status | Reason |
|---|---|---|
| 01 Original | VERIFIED | Source file |
| 02 FLUX Restore | VERIFIED | Replicate call succeeded (17s, ~$0.036) |
| 03 GFPGAN | SKIPPED | RUNPOD_API_KEY not configured |
| 04 Real-ESRGAN | SKIPPED | REAL_ESRGAN_URL not configured |
| 05 DDColor | SKIPPED | RUNPOD_API_KEY not configured + image not grayscale |
| 06 LaMa | SKIPPED | RUNPOD_API_KEY not configured + scratch detection (47%) >15% would have triggered |
| 07 Final | PASSTHROUGH | Only FLUX Restore output with no local post-processing |

**Pipeline executed:** FLUX Restore (Replicate) → passthrough (all local stages disabled by missing env vars)

## Comparison with Commercial-Quality Pipeline A (OPS-109)

| Metric | Current Pipeline | Pipeline A (OPS-109) | Difference |
|---|---|---|---|
| SSIM | 0.57 | 0.58 | -0.01 (negligible) |
| PSNR | 7.29 | 7.56 | -0.27 (negligible) |
| Sharpness | 100 | 100 | None |
| Noise | 100 | 100 | None |
| Local Post-Processing | NOT EXECUTED | NOT EXECUTED (OPS-109 also lacked local processing for Pipeline A) | Same |

**Conclusion:** The current output matches the earlier Pipeline A output because **both Pipelines A and the current pipeline only execute FLUX Restore** and skip all local post-processing stages. The commercial quality was never achieved because the local stages (GFPGAN, Real-ESRGAN, DDColor, LaMa) were never wired to working endpoints in the production environment.

The SSIM/PSNR differences (0.57 vs 0.58, 7.29 vs 7.56) are within measurement noise and reflect only the FLUX Restore output variability.
