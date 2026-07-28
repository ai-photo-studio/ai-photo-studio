# OPS-110 — Recommendations

**Date:** 2026-07-23

## PRIMARY: Production Pipeline is Correct

**The current production pipeline emits exactly 1 Replicate prediction per uploaded image.**  
The configuration set in OPS-108 already achieves the primary goal.

## Recommendation 1: Disable Redundant Providers from Default Routing

**Status: Already done in OPS-108.**  
`ProviderPolicyEngine.ts` and `ProviderFactory.ts` already route all package tiers to `flux-restore` with `unified-local` fallback. No changes needed.

## Recommendation 2: Add Stage-Specific Endpoints to Python Service (FUTURE)

**Severity: MEDIUM — not blocking pass criteria but wastes RunPod GPU credits.**

The `UnifiedLocalRestorationProvider` makes 3-4 calls to `{RESTORATION_ENDPOINT_URL}/restore`, each of which runs the full Python pipeline redundantly. Adding individual endpoints to `services/restoration/app.py` would eliminate this waste:

```
POST /inpaint        → run LaMa only
POST /gfpgan         → run GFPGAN only
POST /colorize       → run DDColor only  
POST /upscale        → run Real-ESRGAN only (already exists at REAL_ESRGAN_URL)
```

**Effort:** ~2 hours (Python FastAPI endpoint creation)
**Impact:** 60-75% reduction in self-hosted GPU compute per image

## Recommendation 3: Restore Individual Self-Hosted Services

**Severity: LOW**

The codebase has individual microservices under `services/`:
- `services/gfpgan/app.py` — standalone GFPGAN FastAPI service
- `services/ddcolor/app.py` — standalone DDColor FastAPI service
- `services/lama/app.py` — standalone LaMa FastAPI service
- `services/real-esrgan/app.py` — standalone Real-ESRGAN FastAPI service

If these were deployed and `REAL_ESRGAN_URL`, `GFPGAN_URL`, `DDCOLOR_URL`, `LAMA_URL` environment variables were configured, the `UnifiedLocalRestorationProvider` could call individual services instead of the unified pipeline. However, the unified pipeline approach works and is simpler to operate.

## Recommendation 4: Provider Registry Cleanup — Mark as Dormant

**Severity: INFORMATIONAL**

The following providers exist in codebase but are no longer in the production path. Mark them as dormant in documentation (already done via routing config):

- `ReplicateProvider` (sczhou/codeformer) — removed in OPS-108
- `GFPGANProvider` (tencentarc/gfpgan) — removed in OPS-108
- `DDColorProvider` (piddnad/ddcolor) — removed in OPS-108
- `OpenAIProvider` — never in default HD/Premium routing
- `MicrosoftBringOldPhotosProvider` — benchmark only, OPS-109

## Configuration to Enforce

Already applied (OPS-108). No further changes needed:

| Setting | Value | File |
|---------|-------|------|
| Primary provider | `flux-restore` | `ProviderPolicyEngine.ts:70-114` |
| Fallback provider | `unified-local` | `ProviderPolicyEngine.ts:70-114` |
| All package tiers | `flux-restore → unified-local` | `ProviderFactory.ts:68-75` |
| Pipeline HD steps | `flux-restore → unified-local-postprocessing` | `PipelineOrchestrator.ts:67-73` |
| Pipeline Premium steps | `flux-restore → unified-local-postprocessing` | `PipelineOrchestrator.ts:77-83` |
| Disabled providers | `["runpod"]` | `ProviderPolicyEngine.ts:121` |

## Verdict

**PASS criteria met.** The production pipeline:
- ✅ Exactly 1 Replicate prediction per uploaded image
- ✅ All post-processing stages execute locally
- ✅ No duplicate Replicate calls
- ✅ Local alternatives exist for all non-primary stages
- ✅ Configuration correctly routes to `flux-restore` as the sole Replicate provider