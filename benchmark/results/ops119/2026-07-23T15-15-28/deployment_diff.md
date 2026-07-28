# Deployment Comparison: Benchmark vs Production

**Date:** 2026-07-23T15:15:29.094Z

## How Benchmark Runs Differ from Production

| Aspect | CLI Benchmark (ops116/117/118) | Production POST /process |
|---|---|---|
| Pipeline provider creation | `ReplicatePipelineProvider` directly | `PipelineOrchestrator` in restoration service |
| Tier selection | Uses Orchestrator's default (replicate) | HARDCODED to "hd" |
| Restoration provider | `ReplicatePipelineProvider` | `FluxRestoreProvider` + `UnifiedLocalRestorationProvider` |
| Environment var | RESTORATION_PIPELINE=replicate explicitly | Env var set but ignored |
| Post-processing | 3 Replicate calls | RunPod calls (fail → passthrough) |
| Quality | SSIM 0.58 (matched OPS-109) | SSIM 0.56 (flux only, degraded) |

## Why Benchmarks Show Higher Quality

The CLI benchmarks (ops116-ops118) create the PipelineOrchestrator and use the default tier,
which correctly resolves to `replicate` when `RESTORATION_PIPELINE=replicate`.

The production route hardcodes `"hd"` so it always uses the legacy RunPod path regardless
of the `RESTORATION_PIPELINE` env var setting.

**The `RESTORATION_PIPELINE` feature flag is correctly implemented but never reached**
because the production code path bypasses it.
