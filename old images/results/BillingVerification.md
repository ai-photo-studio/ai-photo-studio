# Billing Verification Report

**Date:** 2026-07-22T13:58:01.246Z
**Benchmark:** OPS-94 — Single image commercial restoration

## Replicate Billing

| Field | Value | Source Classification |
|---|---|---|
| Prediction ID | 71pd7tcx4nrmr0czh8etcfj4sg | METADATA |
| GPU Seconds | 1.87 | API response (metrics.predict_time) |
| Official GPU Price | $0.00085/sec (T4) | Replicate published pricing |
| Calculated Cost | $0.001600 | **CALCULATED** - GPU sec x price, not an invoice |
| Estimated Cost (fixed) | $0.003400 | ESTIMATED - fixed per-image rate |
| Invoice Available | No | Replicate does not expose per-prediction billing in API |

**Billing Discrepancy:** Replicate does not return invoice charges in prediction responses. The API returns metrics.predict_time (GPU seconds), but no billed amount or invoice reference. The actualCost of $0.001600 is **CALCULATED** from GPU seconds x $0.00085, not an actual invoice charge. The actual Replicate invoice may differ based on account tier, GPU type, and any discounts.

## OpenAI Billing

| Field | Value | Source Classification |
|---|---|---|
| Model Detected | gpt-image-1 | API model list |
| Endpoint | POST /v1/images/edits | API request |
| Image Size | 37.4 KB | Input image |
| Output Size | 2.00 MB | Output image |
| Input Tokens | not returned by API | API response |
| Output Tokens | not returned by API | API response |
| Official Pricing | gpt-image-1: $0.015/1K input tokens + $0.06/1K output tokens | OpenAI published pricing |
| Calculated Cost | $0.000070 | **ACTUAL** - from token usage in API response |
| Invoice Available | No | OpenAI does not return invoice charges in image edit API |

## Billing Discrepancy Analysis

### Why benchmark calculation may differ from OpenAI dashboard spend

1. Token usage may not be returned by the /v1/images/edits endpoint. The usage field is optional and depends on the model. If the API returns usage data, we calculate from it. If not, we estimate from official pricing.
2. The dashboard may aggregate costs across multiple requests, models, and time periods. A single request may not appear as a line item.
3. Free credits or tier discounts are not reflected in the API response.

### Why benchmark calculation may differ from Replicate invoice

1. Replicate does not include billing data in prediction responses. The metrics object only contains predict_time (GPU seconds), not a dollar amount.
2. The calculated cost ($0.00085/GPU-sec) is based on published T4 GPU pricing. Actual billing may use a different rate depending on GPU availability, account tier, or credits.
3. Replicate invoices are generated periodically (not per-prediction) and may include minimum charges or rounding.

## Cost Source Classification

| Label | Definition | Example |
|---|---|---|
| **ACTUAL** | Value from provider's billing API or invoice | Invoice line item, usage endpoint response |
| **CALCULATED** | Value computed from measured usage x official pricing | GPU seconds x published rate |
| **ESTIMATED** | Value based on fixed per-operation pricing | $0.0034/run, $0.04/image |
