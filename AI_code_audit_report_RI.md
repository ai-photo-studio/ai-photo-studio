# OPS-119 — Production Route Forensic Audit

**Date:** 2026-07-23
**Model:** DeepSeek
**Mode:** Code

## Root Cause Found

`restoration.service.ts:337` hardcodes `const pipelineTier: PipelineTier = "hd"` — this line **bypasses** the `RESTORATION_PIPELINE` feature flag entirely.

## Impact

The production `POST /restorations/:id/items/:itemId/process` route ALWAYS uses the `hd` tier (FluxRestoreProvider + UnifiedLocalRestorationProvider), NEVER the `replicate` tier (ReplicatePipelineProvider).

This means:
- Every customer request via the web UI uses the legacy RunPod pipeline
- The `RESTORATION_PIPELINE=replicate` env var (OPS-116) has NO EFFECT on production
- CLI benchmarks (ops116-118) show correct quality because they bypass this code path

## Fix Required

Change `restoration.service.ts:337` from:
```
const pipelineTier: PipelineTier = "hd";
```
to:
```
const pipelineTier: PipelineTier = this.pipelineOrchestrator.getDefaultTier();
```

## Environment Resolution

| Source | RESTORATION_PIPELINE Value |
|---|---|
| .env.project.example | NOT SET |
| .env.local | NOT SET |
| northflank.json | NOT SET |
| deploy.yml | NOT SET |
| process.env | replicate (explicit) |

## Legacy Callers

140 legacy provider references found in production code (all via PipelineOrchestrator/ProviderFactory — conditional on tier selection). No direct calls to RunPod services bypassing the orchestrator in production routes.

## Evidence

All artifacts saved to `benchmark/results/ops119/<timestamp>/`.
