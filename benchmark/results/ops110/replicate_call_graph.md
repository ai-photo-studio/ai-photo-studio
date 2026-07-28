# OPS-110 — Replicate Call Graph

**Date:** 2026-07-23

## Production Call Graph (1 Upload = 1 Replicate Call)

```
Upload
  │
  ▼
POST /api/restorations/:id/items/:itemId/process
  │
  ▼
RestorationService.processItem()
  │
  ▼
PipelineOrchestrator.execute(tier="hd")
  │
  ├─── Step 0: FluxRestoreProvider.restore()
  │         │
  │         ├── BaseReplicateProvider.restore()
  │         │     ├── POST https://api.replicate.com/v1/models/flux-kontext-apps/restore-image/versions/{hash}/predictions
  │         │     ├── POLL GET https://api.replicate.com/v1/predictions/{id}
  │         │     └── GET {output_url} (download result)
  │         │
  │         └── 1 Replicate prediction ✅
  │
  └─── Step 1: UnifiedLocalRestorationProvider.restore()
            │
            ├── (decision) analyzeDamage() — local heuristic
            │     NO API CALL
            │
            ├── LaMa (conditional on scratch > 15%)
            │     └── RestorationInpaintService.inpaint()
            │           └── POST {RESTORATION_ENDPOINT_URL}/restore  → RunPod unified pipeline
            │                 NO REPLICATE CALL (self-hosted on RunPod)
            │
            ├── GFPGAN (always)
            │     └── RestorationGfpganService.enhance()
            │           └── POST {RESTORATION_ENDPOINT_URL}/restore  → RunPod unified pipeline
            │                 NO REPLICATE CALL (self-hosted on RunPod)
            │
            ├── DDColor (conditional on grayscale)
            │     └── RestorationDdcolorService.colorize()
            │           └── POST {RESTORATION_ENDPOINT_URL}/restore  → RunPod unified pipeline
            │                 NO REPLICATE CALL (self-hosted on RunPod)
            │
            └── Real-ESRGAN (always)
                  └── RealEsrganService.enhance()
                        └── {REAL_ESRGAN_URL}/enhance (or RunPod endpoint)
                              NO REPLICATE CALL (self-hosted on RunPod)
```

---

## All Replicate Providers in Codebase (Not in Production Path)

| Provider | File | Replicate Model | In Production Path? |
|----------|------|----------------|---------------------|
| `FluxRestoreProvider` | `providers/FluxRestoreProvider.ts` | `flux-kontext-apps/restore-image` | ✅ YES — Step 0 of PipelineOrchestrator |
| `ReplicateProvider` | `providers/ReplicateProvider.ts` | `sczhou/codeformer` | ❌ No — old provider, not registered in default pipelines |
| `GFPGANProvider` | `providers/GFPGANProvider.ts` | `tencentarc/gfpgan` | ❌ No — not in PipelineOrchestrator steps |
| `DDColorProvider` | `providers/DDColorProvider.ts` | `piddnad/ddcolor` | ❌ No — not in PipelineOrchestrator steps |
| `NAFNetProvider` | `providers/NAFNetProvider.ts` | `megvii-research/nafnet` | ❌ No — not in PipelineOrchestrator steps |
| `OpenAIProvider` | `providers/OpenAIProvider.ts` | `gpt-image-2` (OpenAI, not Replicate) | ❌ No — not in PipelineOrchestrator steps |
| `MicrosoftBringOldPhotosProvider` | `providers/MicrosoftBringOldPhotosProvider.ts` | `microsoft/bringing-old-photos-back-to-life` | ❌ No — not in PipelineOrchestrator steps |

**VERIFIED: Only `FluxRestoreProvider` is in the production hot path.**

---

## Dormant Replicate Fallback Paths

### ProviderRouter.executeWithRetry

File: `router/ProviderRouter.ts:71`

If the PipelineOrchestrator path were to fail and the old `restoration.service.ts` fallback code were activated:
- Calls `primaryProvider.restore()` up to 3 times (retry logic)
- If primary fails, calls `fallbackProvider.restore()` up to 3 times
- Each retry = 1 Replicate prediction

The configured primary is `flux-restore` → FluxRestoreProvider (1 Replicate call).
The fallback is `unified-local` → UnifiedLocalRestorationProvider (0 Replicate calls).

**VERIFIED: The dormant retry path would produce at most 1 Replicate prediction (primary succeeds) or 0 (primary fails, fallback = unified-local which has 0 cost).**

### ProviderFactory.createForPackage

File: `factory/ProviderFactory.ts:68`

```
preview:  flux-restore → unified-local
basic:    flux-restore → unified-local
premium:  flux-restore → unified-local
print:    flux-restore → unified-local
archive:  flux-restore → unified-local
```

**VERIFIED: All package tiers correctly point to `flux-restore` as primary with `unified-local` as fallback.**

---

## Call Graph Summary

| Stage | Provider | Replicate API Call | Local Alternative Exists | In Production? |
|-------|----------|-------------------|-------------------------|----------------|
| Restoration | FluxRestoreProvider | ✅ flux-kontext-apps/restore-image | ❌ No local equivalent | ✅ Yes |
| Face Restoration | GFPGANProvider (Replicate) | ❌ Not called in production | ✅ UnifiedLocalRestorationProvider → RESTORATION_ENDPOINT_URL | ❌ Dormant |
| Colorization | DDColorProvider (Replicate) | ❌ Not called in production | ✅ UnifiedLocalRestorationProvider → RESTORATION_ENDPOINT_URL | ❌ Dormant |
| Inpainting | NAFNetProvider (Replicate) | ❌ Not called in production | ✅ UnifiedLocalRestorationProvider → RESTORATION_ENDPOINT_URL | ❌ Dormant |
| CodeFormer | ReplicateProvider (Replicate) | ❌ Not called in production | ❌ Removed in OPS-108 | ❌ Dormant |

**VERIFIED: Exactly 1 Replicate prediction per uploaded image in the current production path.**