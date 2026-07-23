# OPS-110 — Complete Pipeline Execution Trace

**Date:** 2026-07-23  
**Scope:** Full forensic trace of the production restoration pipeline

## Entry Points

### 1. HTTP API: `POST /api/restorations/:id/items/:itemId/process`

**File:** `apps/api/src/routes/restoration.routes.ts:19`
**Controller:** `apps/api/src/controllers/restoration.controller.ts:219` — `processItem()`

Flow:
```
HTTP POST → requireAuth → rateLimit → controller.processItem
  → RestorationService.processItem(itemId)
```

### 2. Queue Workers (NOT used for restoration processing)

The BullMQ `image-processing` worker (`workers/image-processing.worker.ts`) handles:
- Product image processing (background removal, YOLO, REMBG, cropping)
- Delivery notification jobs
- Cleanup jobs

**VERIFIED:** The restoration pipeline does NOT pass through queue workers. `processItem()` calls the pipeline directly.

---

## Primary Execution Path (Production)

```
controller.processItem()
  → RestorationService.processItem(itemId)              [restoration.service.ts:268]
    → runQualityAnalysis()                               [local heuristic]
    → analyzeDamage()                                    [local heuristic]
    → PipelineOrchestrator.execute(request, "hd")        [pipeline/PipelineOrchestrator.ts:97]
      │
      ├── Step 0: FluxRestoreProvider.restore()          [providers/FluxRestoreProvider.ts]
      │     → BaseReplicateProvider.restore()             [providers/BaseReplicateProvider.ts:52]
      │       → POST /v1/models/flux-kontext-apps/restore-image/versions/{hash}/predictions
      │       → Poll GET /v1/predictions/{id}
      │       → Download result image from output URL
      │     ← Returns RestorationResult (actualCost, processingTimeMs, actualGPUSeconds)
      │
      └── Step 1: UnifiedLocalRestorationProvider.restore()  [providers/UnifiedLocalRestorationProvider.ts:35]
            → analyzeDamage()                            [local heuristic - built-in, no API call]
            → (conditional) LaMa via RestorationInpaintService.inpaint()
            │     → UnifiedRestorationService.restore()
            │       → POST {RESTORATION_ENDPOINT_URL}/restore    [self-hosted RunPod endpoint]
            │         ⚠ This calls the UNIFIED Python restoration service (services/restoration/app.py)
            │           which ALSO runs LaMa, GFPGAN, DDColor, Real-ESRGAN internally
            → GFPGAN via RestorationGfpganService.enhance()
            │     → UnifiedRestorationService.restore()
            │       → POST {RESTORATION_ENDPOINT_URL}/restore    [SAME endpoint]
            │         ⚠ SAME unified Python service — calls the full pipeline again
            → (conditional) DDColor via RestorationDdcolorService.colorize()
            │     → UnifiedRestorationService.restore()
            │       → POST {RESTORATION_ENDPOINT_URL}/restore    [SAME endpoint]
            │         ⚠ SAME unified Python service — calls the full pipeline again
            → Real-ESRGAN via RealEsrganService.enhance()
                  → POST {REAL_ESRGAN_URL}/enhance                [separate self-hosted service]
```

---

## DEEP CRITICAL ISSUE — Duplicate Unified Pipeline Calls

The `UnifiedLocalRestorationProvider` uses RESTORATION_ENDPOINT_URL for EVERY local stage:

| Call | Endpoint | What happens on the server |
|------|----------|---------------------------|
| `inpaintService.inpaint()` | `{RESTORATION_ENDPOINT_URL}/restore` | Calls FULL unified Python pipeline: damage detect → LaMa → GFPGAN → DDColor → ESRGAN |
| `gfpganService.enhance()` | `{RESTORATION_ENDPOINT_URL}/restore` | Calls FULL unified Python pipeline AGAIN on already-processed image |
| `ddcolorService.colorize()` | `{RESTORATION_ENDPOINT_URL}/restore` | Calls FULL unified Python pipeline AGAIN on already-processed image |

**ROOT CAUSE:** All 3 services (`RestorationInpaintService`, `RestorationGfpganService`, `RestorationDdcolorService`) in `restoration-provider.service.ts:172-222` call `this.service.restore()` which sends to `{RESTORATION_ENDPOINT_URL}/restore`. This endpoint runs the ENTIRE Python pipeline — not individual stages.

---

## Python Service Architecture (`services/restoration/app.py`)

The unified Python endpoint `POST /restore` runs:
```
_detect_damage() → _apply_lama() → _restore_face_gfpgan() → _colorize_ddcolor() → _upscale_realesrgan()
```

It accepts an input image and applies ALL stages in sequence. There is no stage-specific endpoint like `/inpaint`, `/gfpgan`, `/colorize`, or `/enhance`.

**Result:** Each call to `{RESTORATION_ENDPOINT_URL}/restore` re-runs damage detection + inpainting + face restoration + colorization + upscaling on whatever image is sent. After the `FluxRestoreProvider` step, sending the result back through the unified endpoint means the Python service re-processes an already-processed image through its full pipeline.

---

## REAL_ESRGAN_URL

**File:** `apps/api/src/services/real-esrgan.service.ts:25`

The `RealEsrganService.enhance()` is the ONE correctly separated stage. It sends to:
- `{REAL_ESRGAN_URL}/enhance` (if URL) OR
- RunPod endpoint (if short ID)

This is a dedicated endpoint that ONLY does upscaling. **VERIFIED: This is correctly isolated.**

---

## Summary: Replicate Calls Per Uploaded Image

| Provider | Replicate Call | Count | When |
|----------|---------------|-------|------|
| `FluxRestoreProvider` | `flux-kontext-apps/restore-image` | **1** | Step 0 of PipelineOrchestrator |
| `UnifiedLocalRestorationProvider` | None directly | 0 | Calls local services only |

**VERIFIED:** The PipelineOrchestrator HD tier produces **exactly 1 Replicate prediction** for the primary restoration.

However, the `UnifiedLocalRestorationProvider` makes **3-4 HTTP calls** to the local self-hosted Python service, each of which re-runs the full pipeline unnecessarily.

---

## Historical K Paths (Now Bypassed)

The old `ProviderRouter` + `ProviderPolicyEngine` + `restoration.service.ts` fallback path:

```
restoration.service.ts:processItem() [OLD pre-OPS-108 path]
  → policyEngine.makeRoutingDecision()
  → providerRouter.route()
    → executeWithRetry(primaryProvider, 3 retries)
      → if all fail: executeWithRetry(fallbackProvider, 3 retries)
        → if fallback fails: throw
```

This path was **replaced by PipelineOrchestrator** in OPS-108. The `providerRouter` and `policyEngine` are no longer in the hot path for `processItem()`.

**VERIFIED:** Current production hot path goes through `PipelineOrchestrator.execute()` only.
**VERIFIED:** The old `ProviderRouter` + `ProviderPolicyEngine` path is dormant in `restoration.service.ts` (field declarations exist but never called from processItem).

---

## Feature Flags & Env Vars

| Variable | Current Value | Impact |
|----------|--------------|--------|
| `RESTORATION_ENDPOINT_URL` | `3z633s11yn4n8q` (RunPod ID) | Controls where UnifiedRestorationService sends requests |
| `REAL_ESRGAN_URL` | `""` (unset) | Real-ESRGAN falls back to pass-through (returns input unchanged) |
| `PROVIDER_MODE` | `automatic` | Controls ProviderPolicyEngine routing (dormant path) |
| `AI_PROVIDER` | `local-rembg` | Controls old ImageProvider chain (product images, not restoration) |
| `REPLICATE_API_TOKEN` | set | Required for FluxRestoreProvider |

---

## Cost Tracking Per Image

```
Replicate cost (1 call):
  FluxRestoreProvider: ~$0.009-0.025/run (varies by GPU seconds)

Local service costs (0 Replicate cost):
  UnifiedLocalRestorationProvider: $0.000 (self-hosted)
    - But makes 3-4 wasteful HTTP round trips to unified Python service
    - Each round trip runs the full Python pipeline unnecessarily
```

**VERIFIED:** Exactly 1 paid Replicate prediction per uploaded image.
**VERIFIED:** 3-4 local service calls that redundantly run the full Python pipeline.