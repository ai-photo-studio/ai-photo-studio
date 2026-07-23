# OPS-110 — Production Pipeline Cost Audit Plan & Results

## PLAN

1. Trace full execution path from upload to output
2. Audit every Replicate API call: why, when, cost, local alternative
3. Verify exactly 1 Replicate prediction per image
4. Document all providers, dormant paths, and fallback routing
5. Generate reports in benchmark/results/ops110/

## RESULTS

### Primary Goal: VERIFIED ✅
- Exactly 1 Replicate prediction per uploaded image
- All post-processing via UnifiedLocalRestorationProvider (0 Replicate cost)

### Secondary Finding: Redundant Local Calls (Not Replicate)
- UnifiedLocalRestorationProvider makes 3-4 HTTP calls to unified Python service
- Each call re-runs the full Python pipeline redundantly
- This wastes self-hosted GPU credits but does NOT affect Replicate billing

### Configuration: Already Correct (OPS-108)
- Primary: flux-restore → UnifiedLocal as fallback
- All package tiers configured correctly
- No further routing changes needed

### Reports
- benchmark/results/ops110/pipeline_trace.md
- benchmark/results/ops110/replicate_call_graph.md
- benchmark/results/ops110/provider_matrix.csv
- benchmark/results/ops110/cost_breakdown.csv
- benchmark/results/ops110/duplicate_calls.md
- benchmark/results/ops110/recommendations.md