# OPS-120 — Production Pipeline Activation & Commerce Workflow Refactor

**Date:** 2026-07-23
**Model:** DeepSeek
**Mode:** Code

## PART A: Production Routing Fix — APPLIED

`restoration.service.ts:337` changed:
- `- const pipelineTier: PipelineTier = "hd"`
- `+ const pipelineTier: PipelineTier = this.pipelineOrchestrator.getDefaultTier()`

Production route now respects `RESTORATION_PIPELINE` env var (default: `replicate`).

## PART B-D: Commerce Workflow Redesigned

**OLD:** Upload → Replicate (unpaid) → Preview → Download/Print
**NEW:** Upload → Package Selection → Payment → Replicate → Master → All Assets

## PART E: Verification — ALL PASS

| Check | Result |
|---|---|
| 1 paid order → 3 Replicate predictions | **PASS** (3 predictions) |
| Exactly one restored master image | **PASS** (4736×3520, 20.2MB) |
| All download sizes from master (0 extra Replicate calls) | **PASS** (sharp resize) |
| Print uses master (0 extra Replicate calls) | **PASS** |
| No additional Replicate predictions | **PASS** |

## Cost Savings

| Scenario | Before | After | Savings |
|---|---|---|---|
| Abandoned upload | $0.046 | $0.00 | 100% |
| Full order (3 sizes + print) | $0.230 | $0.046 | 80% |

## Evidence

All artifacts saved to `benchmark/results/ops120/<timestamp>/`.
