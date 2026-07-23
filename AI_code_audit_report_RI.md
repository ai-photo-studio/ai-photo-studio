# OPS-110 — Production Pipeline Cost Audit & Local Execution Verification

**Date:** 2026-07-23
**Model:** DeepSeek
**Mode:** Code

## Audit Summary

**VERIFIED: The production pipeline emits exactly 1 Replicate prediction per uploaded image.**

The architecture set in OPS-108 already achieves the primary goal. No changes to routing or configuration were needed.

## Key Findings

### 1. Exactly 1 Replicate Call ✅
`PipelineOrchestrator` HD tier executes:
- Step 0: `FluxRestoreProvider` → 1 Replicate call (flux-kontext-apps/restore-image)
- Step 1: `UnifiedLocalRestorationProvider` → 0 Replicate calls

### 2. All Other Replicate Providers Are Dormant
- `OpenAIProvider` — not in default routing
- `ReplicateProvider` (CodeFormer) — removed in OPS-108
- `GFPGANProvider` (Replicate) — removed in OPS-108
- `DDColorProvider` (Replicate) — removed in OPS-108
- `MicrosoftBringOldPhotosProvider` — not in default routing

### 3. Redundant Local Service Calls (Not Replicate)
`UnifiedLocalRestorationProvider` makes 3-4 calls to `{RESTORATION_ENDPOINT_URL}/restore`, each of which re-runs the full unified Python pipeline. This wastes self-hosted GPU credits but does NOT generate Replicate charges.

### 4. Correct Configuration
All package tiers in `ProviderFactory` and `ProviderPolicyEngine` route to `flux-restore` primary with `unified-local` fallback. No further routing changes needed.

### 5. Dormant Fallback Paths
The old `ProviderRouter` + `ProviderPolicyEngine` path is still present in the codebase but not executed during `processItem()`.

## Reports Generated

`benchmark/results/ops110/`:
- `pipeline_trace.md` — Full execution trace from upload to output
- `replicate_call_graph.md` — Every Replicate API call documented
- `provider_matrix.csv` — All providers with their status
- `cost_breakdown.csv` — Cost per provider
- `duplicate_calls.md` — Duplicate call analysis
- `recommendations.md` — Recommendations