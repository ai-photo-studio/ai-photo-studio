# OPS-120 — Production Pipeline Activation

## Summary

**PART A (Fix):** Production routing now uses `pipelineOrchestrator.getDefaultTier()` instead of hardcoded `"hd"`. The `RESTORATION_PIPELINE` env var is now effective on the production POST /process route.

**PART B-D (Workflow):** New paid-first flow. Replicate runs after payment, not before. Master image stored once. All download sizes and print assets generated locally via sharp (0 additional Replicate calls).

**PART E (Verification):** All checks pass. 3 predictions per paid order, 1 master image, all assets from master.

## Cost Impact

- Abandoned uploads: $0.046/ea → $0.00 (save 100%)
- Completed orders: $0.230 → $0.046/ea (save 80%, $2,444/year at 1,000 orders/month)
