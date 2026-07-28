# OPS-117 Replicate Forensic Cost Audit

**Date:** 2026-07-23T13:42:17.230Z
**Image:** old images/2.jpeg (3f6b0d3fd482e1f5...)
**Pipeline:** RESTORATION_PIPELINE=replicate (flux → gfpgan → upscale)
**Retries:** DISABLED (0 retries)

## Summary

| Metric | Value |
|---|---|
| Total predictions | 3 (expected: 3) |
| Duplicate predictions | 0 |
| Total cost | $0.054300 |
| Total GPU seconds | 23.6278 |
| Total runtime | 52952ms |

## Per-Prediction Detail

| # | Stage | Model | Prediction ID | Runtime (ms) | GPU sec | Cost | Input SHA | Output SHA |
|---|---|---|---|---|---|---|---|---|
| 1 | flux_restore | flux-kontext-apps/restore-image | 8gdp09x219rmw0czhwtr39sz9c | 20078 | 14.961973066 | $0.034400 | 3f6b0d3fd482e1f5 | dffe5e684edfe927 |
| 2 | gfpgan_face | tencentarc/gfpgan | 4a0m3gzfk1rmw0czhwtvfn7zer | 8694 | 2.775360975 | $0.006400 | dffe5e684edfe927 | 5568d37ab35ac4e0 |
| 3 | gfpgan_upscale | tencentarc/gfpgan | 50x0tmsa71rmy0czhwvbraraw4 | 23937 | 5.890432252 | $0.013500 | 5568d37ab35ac4e0 | 942c6bd3168744f3 |

## Timeline

```
Customer Upload (2.jpeg)
  ↓
| FLUX Restore (8gdp09x219rmw0czhwtr39sz9c) — 20078ms — $0.0344
  ↓
| GFPGAN face (4a0m3gzfk1rmw0czhwtvfn7zer) — 8694ms — $0.0064
  ↓
| GFPGAN upscale (50x0tmsa71rmy0czhwvbraraw4) — 23937ms — $0.0135
  ↓
Final Image
```

## Prediction Integrity

| Check | Result | Evidence |
|---|---|---|
| Expected predictions | 3 | 3 stages × 1 call each |
| Actual predictions | 3 | See prediction_timeline.csv |
| Duplicate predictions | 0 | See duplicate_prediction_report.md |
| Predictions from polling | 0 | Polling uses GET, never POST |
| Predictions from webhook | 0 | No webhook configured |
| Retries | 0 | Explicitly disabled for OPS-117 |

## Cost Breakdown

| Stage | Cost Calculation | Amount |
|---|---|---|
| FLUX Restore | 14.961973066s × $0.0023/s | $0.034400 |
| GFPGAN face | 2.775360975s × $0.0023/s | $0.006400 |
| GFPGAN upscale | 5.890432252s × $0.0023/s | $0.013500 |
| **Total** | | **$0.054300** |

## Batch Support

| Model | Batch Support |
|---|---|
| flux-kontext-apps/restore-image | NO |
| tencentarc/gfpgan | NO |

Neither model supports batching. Each customer image generates exactly 3 predictions.

## HTTP Trace

Raw HTTP request/response dumps saved to `D:\AI Product Photo Studio on WhatsApp\benchmark\results\ops117\2026-07-23T13-41-22\http_trace/`

## Files Generated

| File | Description |
|---|---|
| replicate_cost_audit.md | This report |
| prediction_timeline.csv | Per-prediction timeline |
| prediction_tree.json | Full prediction tree with timeline |
| http_trace/ | Raw HTTP request/response dumps |
| billing_summary.csv | Cost summary |
| duplicate_prediction_report.md | Duplicate prediction verification |
| batch_support.md | Batch/multi-image support analysis |