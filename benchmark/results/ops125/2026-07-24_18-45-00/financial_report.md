# OPS-125 — Financial Report

**Date:** 2026-07-24

## Daily Financial Summary

| Metric | Value | Source |
|--------|-------|--------|
| Revenue PKR | From Payment.paidAt today (PKR) | Payment model |
| Revenue USD | From Payment.paidAt today (non-PKR) | Payment model |
| Replicate Cost | From ProviderCostLog (flux-restore) today | ProviderCostLog model |
| Gross Margin | ((Revenue - Cost) / Revenue) * 100 | Calculated |
| Avg Order Value | Revenue PKR / Paid Orders count | Calculated |

## Cost per Order

| Cost Type | Computation | Status |
|-----------|------------|--------|
| Replicate API cost | ProviderCostLog.estimatedCost/actualCost | VERIFIED |
| Provider cost by type | RESTORATION_INPAINT, RESTORATION_FACE, RESTORATION_COLORIZE, RESTORATION_UPSCALE | VERIFIED |
| Total Replicate (today) | Sum of flux-restore ProviderCostLogs today | VERIFIED |
| Total Replicate (all time) | Sum of all flux-restore ProviderCostLogs | VERIFIED |

## Profit per Order

Profit = Revenue - Replicate Cost

Available in business metrics as `grossMargin` percentage:
- Daily Gross Margin = (dailyRevenue - dailyReplicateCost) / dailyRevenue * 100

## Monthly Projection

| Projection | Formula | Status |
|------------|---------|--------|
| Daily Revenue PKR (average) | Sum of today's paid PKR amounts | VERIFIED |
| Monthly Revenue PKR (projected) | Daily PKR * 30 | UNKNOWN |
| Monthly Replicate Cost (projected) | Daily Replicate * 30 | UNKNOWN |
| Monthly Profit (projected) | Monthly Revenue - Monthly Cost | UNKNOWN |

## Financial Endpoints

| Endpoint | Data | Status |
|----------|------|--------|
| `GET /admin/business-metrics?hours=24` | Daily revenue PKR/USD, Replicate cost, gross margin | VERIFIED |
| `GET /admin/cost-metrics?hours=24` | Total estimated/actual cost, cost by provider | VERIFIED |
| `GET /admin/creative-cost-metrics?hours=24` | FLAT_LAY, LIFESTYLE, MODEL, VIDEO costs | VERIFIED |