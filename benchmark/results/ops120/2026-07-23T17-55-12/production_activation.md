# OPS-120 — Production Pipeline Activation

**Date:** 2026-07-23T17:56:01.931Z

## PART A: Production Routing Fix

**Change made:** `restoration.service.ts:337`

```diff
- const pipelineTier: PipelineTier = "hd";
+ const pipelineTier: PipelineTier = this.pipelineOrchestrator.getDefaultTier();
```

**Status:** ACTIVE

The production route now respects `RESTORATION_PIPELINE` env var.
Default: `replicate` — 3 Replicate calls (proven OPS-109 quality).

## Verification: All Routes Resolve Same Pipeline

| Route | Before OPS-120 | After OPS-120 |
|---|---|---|
| Web UI (POST /restorations/:id/items/:itemId/process) | hd (hardcoded) | replicate (via getDefaultTier()) |
| CLI benchmark (ops116, ops117, ops118) | replicate (direct) | replicate (direct/unchanged) |
| Queue worker | N/A (restoration is synchronous) | N/A |
