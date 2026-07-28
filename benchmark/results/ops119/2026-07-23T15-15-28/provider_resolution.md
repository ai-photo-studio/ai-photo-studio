# Provider Resolution Chain

**Date:** 2026-07-23T15:15:29.083Z

## How Provider Is Selected (Current Production)

```
RESTORATION_PIPELINE env var (default: replicate)
  ↓
env.ts: loadConfig() → config.restorationPipeline
  ↓
PipelineOrchestrator constructor: config.restorationPipeline
  ↓
buildDefaultPipelines() registers all 4 tiers:
  - replicate → ReplicatePipelineProvider (3 Replicate calls)
  - light     → FluxRestoreProvider only
  - hd        → FluxRestoreProvider + UnifiedLocalRestorationProvider
  - premium   → FluxRestoreProvider + UnifiedLocalRestorationProvider
  ↓
REGISTERED BUT NOT USED IN PRODUCTION
getDefaultTier() → returns 'replicate' when RESTORATION_PIPELINE=replicate
  ↓
BUT restoration.service.ts HARDCODES tier:
  pipelineTier = "hd"  ← bypasses getDefaultTier()
  ↓
Execution: FluxRestoreProvider (works) → UnifiedLocalRestorationProvider (RunPod)
  → UnifiedLocalRestorationProvider fails (RUNPOD_API_KEY missing)
  → Degraded to: FluxRestoreProvider only (passthrough)
```

## How Provider SHOULD Be Selected

```
pipelineTier = this.pipelineOrchestrator.getDefaultTier()
  → returns "replicate" (when RESTORATION_PIPELINE=replicate)
  → uses ReplicatePipelineProvider (3 Replicate calls)
  → equals OPS-109 commercial quality
```
