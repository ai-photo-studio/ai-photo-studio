# OPS-110 — Duplicate Replicate Calls Analysis

**Date:** 2026-07-23

## The Problem Statement

> "One uploaded image must create exactly ONE paid Replicate prediction.
> Everything else must execute locally."

## VERIFICATION: Exactly 1 Replicate Prediction

After tracing the full execution path:

**VERIFIED: The current production pipeline produces exactly 1 Replicate prediction per uploaded image.**

The PipelineOrchestrator HD tier executes 2 steps:
1. `FluxRestoreProvider.restore()` → **1 Replicate call** (to `flux-kontext-apps/restore-image`)
2. `UnifiedLocalRestorationProvider.restore()` → **0 Replicate calls** (all local service calls)

## BUT: 3-4 Redundant Local Service Calls

While not Replicate calls, the `UnifiedLocalRestorationProvider` makes unnecessary HTTP round trips to the self-hosted Python service:

| Call | Service | Endpoint | What It Actually Gets |
|------|---------|----------|----------------------|
| 1 | LaMa inpaint | `{RESTORATION_ENDPOINT_URL}/restore` | Full pipeline re-run (damage → LaMa → GFPGAN → DDColor → ESRGAN) |
| 2 | GFPGAN enhance | `{RESTORATION_ENDPOINT_URL}/restore` | Full pipeline re-run (damage → LaMa → GFPGAN → DDColor → ESRGAN) |
| 3 | DDColor colorize | `{RESTORATION_ENDPOINT_URL}/restore` | Full pipeline re-run (damage → LaMa → GFPGAN → DDColor → ESRGAN) |
| 4 | Real-ESRGAN upscale | `{REAL_ESRGAN_URL}/enhance` | Upscaling only ✅ |

**ROOT CAUSE:**  
The unified Python service (`services/restoration/app.py`) has only ONE endpoint: `POST /restore`. It runs the entire pipeline. The TypeScript service wrappers (`RestorationInpaintService`, `RestorationGfpganService`, `RestorationDdcolorService`) all call `this.service.restore()` which hits that same unified endpoint. There are no stage-specific endpoints in the Python service.

**IMPACT:**  
- Unnecessary latency: 3-4 full pipeline runs on the Python side instead of 1
- Excess RunPod GPU usage (credits consumed on the RunPod account)
- No quality degradation (same pipeline runs, just multiple times)

## Duplicate Calls: Frequency

| Scenario | LaMa Call | GFPGAN Call | DDColor Call | ESRGAN Call | Replicate Calls |
|----------|-----------|-------------|-------------|-------------|----------------|
| Color image, light scratch | ❌ skipped | ✅ runs | ❌ skipped | ✅ runs | **1** |
| B&W image, heavy scratch | ✅ runs | ✅ runs | ✅ runs | ✅ runs | **1** |
| Any image | ✅/❌ | ✅ | ✅/❌ | ✅ | **1** |

**Maximum local service calls: 4 (when scratch > 15% AND grayscale AND Real-ESRGAN configured)**

## VERDICT

- **Duplicate Replicate calls: NONE** ✅
- **Duplicate local service calls: 3-4 per image** (redundant, not harmful to quality or Replicate billing)
- **Replicate predictions per image: 1** ✅
- **The system meets the primary goal of "exactly one Replicate prediction per image"**