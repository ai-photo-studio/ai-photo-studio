# OPS-108 — Hybrid Production Pipeline

**Date:** 2026-07-23
**Model:** DeepSeek
**Mode:** Code

## Pipeline Architecture

```
Upload
  |
  v
Damage Analysis (local)
  |
  v
Decision Engine
  |
  v
Replicate: flux-kontext-apps/restore-image
  |
  v
GFPGAN (local - self-hosted service)
  |
  v
Real-ESRGAN (local - self-hosted service)
  |
  v
DDColor (local - conditional: grayscale only)
  |
  v
LaMa (local - conditional: scratch severity > threshold)
  |
  v
Quality Validation
  |
  v
Output
```

## Key Changes

### Replicate: ONLY flux-kontext-apps/restore-image
- Single Replicate model used for all tiers
- No additional Replicate restoration models (no sczhou/codeformer, no tencentarc/gfpgan, no piddnad/ddcolor)
- Model: `flux-kontext-apps/restore-image@85ae4655`

### Local Processing (All Remaining Stages)
- **GFPGAN**: Self-hosted service (always applied for face restoration)
- **Real-ESRGAN**: Self-hosted service (always applied for upscaling)
- **DDColor**: Self-hosted service (conditional — only when image is grayscale)
- **LaMa**: Self-hosted service (conditional — only when scratch severity > 15% threshold)

### Removed from Production Routing
- **CodeFormer**: Removed from all production routing
- **DDColor**: Removed from default routing (now grayscale-only conditional)
- **GFPGAN Replicate**: Removed (now local only)
- **OpenAI GPT Image**: Removed from pipeline defaults

## Files Modified

| File | Change |
|------|--------|
| `services/restoration/app.py` | Always use GFPGAN; remove CodeFormer branching |
| `apps/api/src/restoration-providers/pipeline/PipelineOrchestrator.ts` | Hybrid pipeline: FLUX Restore + unified local postprocessing |
| `apps/api/src/restoration-providers/providers/UnifiedLocalRestorationProvider.ts` | NEW: Local provider handling GFPGAN, Real-ESRGAN, conditional DDColor/LaMa |
| `apps/api/src/restoration-providers/factory/ProviderFactory.ts` | Register unified-local provider; update package routing |
| `apps/api/src/restoration-providers/policy/ProviderPolicyEngine.ts` | All tiers use flux-restore + unified-local |
| `apps/api/src/providers/model-selection.matrix.ts` | Remove CodeFormer fallback |
| `apps/api/src/services/pipeline-builder.service.ts` | Remove CodeFormer from enterprise tier |
| `apps/api/src/services/restoration.service.ts` | Use PipelineOrchestrator for hybrid execution |

## Provider Abstraction

The provider abstraction layer (`IRestorationProvider`, `ProviderFactory`, `ProviderRouter`) remains unchanged. The new `UnifiedLocalRestorationProvider` implements the same interface as all other providers.

## Protected Scope

- No finalized APIs modified
- No billing logic modified
- No authentication modified
- No public endpoints changed