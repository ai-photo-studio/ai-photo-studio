# OPS-119 — Production Route Forensic Audit

**Date:** 2026-07-23T15:15:29.082Z

## Root Cause

**The production route hardcodes `pipelineTier = "hd"` instead of using the Orchestrator's default.**

File: `restoration.service.ts:337`
```typescript
const pipelineTier: PipelineTier = "hd";
```

This means every customer request via `POST /restorations/:id/items/:itemId/process`
uses the HD tier (FluxRestoreProvider → UnifiedLocalRestorationProvider) instead of the
`replicate` tier (ReplicatePipelineProvider — proven OPS-109 commercial quality).

The `RESTORATION_PIPELINE` env var is correctly defined in `env.ts` and the Orchestrator's
`getDefaultTier()` correctly returns `"replicate"` — but this method is NEVER called
by the production route.

## Call Chain

```
Frontend (RestoreNewPage.tsx)
  ↓ POST /api/restorations
restoration.routes.ts → RestorationController.createOrder()
  ↓ POST /api/restorations/:id/items (upload)
restoration.routes.ts → RestorationController.addItem()
  ↓ POST /api/restorations/:id/items/:itemId/process
restoration.routes.ts → RestorationController.processItem()
  ↓
RestorationService.processItem(itemId)  [restoration.service.ts:268]
  ├── quality analysis (synthetic)
  ├── damage assessment (synthetic)
  ├── pipelineOrchestrator.execute(request, "hd")  ← LINE 337: HARDCODED
  │   └── PipelineOrchestrator.getDefaultTier()  ← NEVER CALLED
  │       └── returns "replicate" when RESTORATION_PIPELINE=replicate
  └── upload result, settle wallet, mark complete/FAILED
```

## Fix Required

Change `restoration.service.ts:337` from:
```typescript
const pipelineTier: PipelineTier = "hd";
```
to:
```typescript
const pipelineTier: PipelineTier = this.pipelineOrchestrator.getDefaultTier();
```
