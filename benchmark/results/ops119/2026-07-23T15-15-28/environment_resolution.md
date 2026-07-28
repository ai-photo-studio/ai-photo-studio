# Environment Resolution Audit

**Date:** 2026-07-23T15:15:29.092Z

## RESTORATION_PIPELINE Resolution Across Environments

| Environment Source | Value | Effect |
|---|---|---|
| | .env.project.example | NOT SET | |
| | .env.local | NOT SET | |
| | northflank.json | NOT SET | |
| | .github/workflows/deploy.yml | NOT SET | |
| | process.env (current shell) | replicate |
| `env.ts` Zod schema default | `replicate` | Correct default when env var not set |
| `PipelineOrchestrator.getDefaultTier()` | `replicate` when mode=replicate | Correct logic but **never called** |
| restoration.service.ts:337 | HARDCODED "hd" | **BUG: Always uses hd tier** |

## Effective Provider Per Environment

| Component | RESTORATION_PIPELINE | Effective Tier | Effective Provider |
|---|---|---|---|
| CLI benchmark (ops116/117/118) | replicate (explicit) | replicate | ReplicatePipelineProvider ★ CORRECT |
| Northflank (production) | NOT SET (defaults to replicate) | hd (hardcoded) | FluxRestoreProvider + legacy RunPod |
| Cloud Run (legacy) | NOT SET | hd (hardcoded) | FluxRestoreProvider + legacy RunPod |
| Local dev | NOT SET (defaults to replicate) | hd (hardcoded) | FluxRestoreProvider + legacy RunPod |

## Resolution

The `RESTORATION_PIPELINE` env var has no effect on the production API route because
`restoration.service.ts:337` bypasses the Orchestrator's default tier resolution.

To fix: Change line 337 to use `this.pipelineOrchestrator.getDefaultTier()`.
