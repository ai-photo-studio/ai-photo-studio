# OPS-119 — Production Route Forensic Audit

## Root Cause

**`restoration.service.ts:337` hardcodes `pipelineTier = "hd"`, bypassing the `RESTORATION_PIPELINE` feature flag.**

The OPS-116 `RESTORATION_PIPELINE=replicate` env var is correctly implemented in `env.ts` and `PipelineOrchestrator`, but the production route never accesses it. The Orchestrator's `getDefaultTier()` method correctly returns `"replicate"` when the env var is set, but it is never called.

CLI benchmarks (ops116-118) show correct quality because they create their own PipelineOrchestrator or call ReplicatePipelineProvider directly. Production customers always get the `hd` tier (RunPod → passthrough), which was the root cause of degraded quality at https://www.thannow.com/restore/<id>.

**Fix:** Change line 337 to use `this.pipelineOrchestrator.getDefaultTier()`.
