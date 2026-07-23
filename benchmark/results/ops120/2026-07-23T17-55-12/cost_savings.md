# OPS-120 — Cost Savings Analysis

**Date:** 2026-07-23T17:56:01.934Z

## Per-Image Replicate Cost (Single Paid Order)

| Stage | Model | GPU Seconds | Cost |
|---|---|---|---|
| FLUX Restore | flux-kontext-apps/restore-image | 8.62 | $0.0198 |
| GFPGAN face | tencentarc/gfpgan (v1.4) | 4.31 | $0.0099 |
| GFPGAN upscale | tencentarc/gfpgan (scale=2) | 4.31 | $0.0099 |
| **Total** | | **17.2344** | **$0.0397** |

## Savings from Master Asset Strategy

| Scenario | Old Cost | New Cost | Savings per image |
|---|---|---|---|
| Customer uploads, abandons | $0.046 | $0.00 | $0.046 (100%) |
| Customer downloads 1 size | $0.046 | $0.046 | $0.00 |
| Customer downloads 3 sizes | $0.138 | $0.046 | $0.092 (67%) |
| Customer prints 1 item | $0.092 | $0.046 | $0.046 (50%) |
| Full order (3 sizes + print) | $0.230 | $0.046 | $0.184 (80%) |

## Revenue vs Cost per Image

| Package | Price (PKR) | Price (USD) | Replicate Cost | Margin (PKR) | Margin (USD) |
|---------|------------|------------|---------------|-------------|-------------|
| Original | ₨250 | $1.50 | $0.046 (₨12.9) | ₨237 | $1.45 |
| 2X | ₨350 | $2.50 | $0.046 (₨12.9) | ₨337 | $2.45 |
| 4X | ₨500 | $3.50 | $0.046 (₨12.9) | ₨487 | $3.45 |

## Expected Monthly Burn (1000 orders)

| Metric | Before OPS-120 | After OPS-120 |
|---|---|---|
| Abandoned uploads (30%) | 428 × $0.046 = $19.69 | $0.00 |
| Completed orders (70%) | 1000 × $0.230 = $230.00 | 1000 × $0.046 = $46.00 |
| **Total monthly Replicate cost** | **$249.69** | **$46.00** |
| **Annual savings** | | **$2,444.28** |
