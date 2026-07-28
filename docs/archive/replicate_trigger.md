# Replicate Trigger Sequence — OPS-151

## Verified: Replicate is NEVER called before payment approval.

### Complete Trigger Chain

```
[Frontend]
  User completes payment in UI → navigate("/restore/:orderId")
  → RestoreOrderPage polls every 7s for status

[Backend]
  POST /api/restorations/:id/items/:itemId/process
  → RestorationController.processItem()
    → PAYMENT GUARD: order.status === "APPROVED" || "COMPLETED"
      → If NOT approved: HTTP 402 PAYMENT_REQUIRED
      → If approved:
        → RestorationService.processItem()
          → PipelineOrchestrator.execute("replicate" tier)
            → ReplicatePipelineProvider
              → 3 sequential Replicate API calls (FLUX Restore model)
              → Results stored in R2 + Prisma
```

### Guard Points

| Location | Guard | Effect |
|----------|-------|--------|
| `restoration.controller.ts:processItem` | `order.status !== "APPROVED" && order.status !== "COMPLETED"` | Returns HTTP 402 |
| `ProviderPolicyEngine.ts` | `disabledProviders: ["runpod"]` | RunPod never called |

### What triggers Replicate

ONLY the backend endpoint `POST /api/restorations/:id/items/:itemId/process` with an approved order. The frontend never calls Replicate directly. The pipeline orchestrator defaults to the `"replicate"` tier, which uses `ReplicatePipelineProvider`.

### No AI analysis before payment

With OPS-151, the customer-facing flow no longer calls any AI/analysis API:
- Quality-analysis is NOT called from the frontend
- No external face detection
- No damage scoring
- No quality scoring
- Only instant metadata computed client-side (dimensions from Image() browser API)
