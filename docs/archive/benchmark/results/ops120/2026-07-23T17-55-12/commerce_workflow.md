# OPS-120 — Commerce Workflow Refactor

**Date:** 2026-07-23T17:56:01.932Z

## New Customer Workflow

```
OLD (unpaid Replicate processing):
Upload → Replicate → Preview → Download/Print

NEW (paid-first):
Upload
  ↓
Image information only (no AI processing)
  ↓
Package selection: Original (PKR 250 / USD $1.50)
                         2X (PKR 350 / USD $2.50)
                         4X (PKR 500 / USD $3.50)
  ↓
Payment (JazzCash / EasyPaisa / Manual via Bank Alfalah)
  ↓
Replicate pipeline (3 predictions — FLUX + GFPGAN + upscale)
  ↓
Store restored master image (single source of truth)
  ↓
Generate download sizes from master:
  - Original: master resolution
  - 2X: half resolution (via sharp resize)
  - 4X: quarter resolution (via sharp resize)
  ↓
Secure signed download URL (15 min expiry, S3 presigned)
  ↓
Optional: Print products from master image
```

## Key Changes

1. **Replicate runs only after payment.** No unpaid Replicate costs.
2. **Single master image.** All sizes derived locally via sharp (0 additional Replicate calls).
3. **Print uses master.** No separate processing for print.
4. **No approve/reject/quality scores on customer-facing pages.** These are admin-only.

## Cost Savings

| Scenario | Before OPS-120 | After OPS-120 | Savings |
|---|---|---|---|
| Customer uploads but doesn't pay | $0.046 (wasted Replicate cost) | $0.00 | $0.046 per abandoned upload |
| Customer downloads multiple sizes | $0.046 × 3 sizes = $0.138 | $0.046 (one master) | $0.092 |
| Customer prints | $0.046 (additional Replicate) | $0.00 (from master) | $0.046 |
| **Total per completed order** | **$0.230** | **$0.046** | **$0.184 (80% savings)** |
