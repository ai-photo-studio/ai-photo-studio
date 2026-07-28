# OPS-125 — Launch Dashboard & Beta Operations

**Date:** 2026-07-24

## Dashboard Features

The admin dashboard (`/admin/dashboard`) has been extended with three new metric sections:

### 1. Business Analytics Section
| Metric | Source | Status |
|--------|--------|--------|
| Daily Uploads | OrderImage (ORIGINAL) count | VERIFIED |
| Paid Orders (Today) | Payment count (PAID, today) | VERIFIED |
| Conversion Rate | Paid / Total Restore Items | VERIFIED |
| Avg Order Value | Daily Revenue / Paid Orders | VERIFIED |
| Revenue PKR (Today) | Daily payment totals (PKR) | VERIFIED |
| Revenue USD (Today) | Daily payment totals (non-PKR) | VERIFIED |
| Replicate Cost (Today) | ProviderCostLog (flux-restore/replicate) | VERIFIED |
| Gross Margin | (Revenue - Replicate Cost) / Revenue | VERIFIED |
| Print Orders (Today) | OrderItem (itemType=print) count | VERIFIED |
| Repeat Customers | CustomerId with >1 paid order | VERIFIED |

### 2. Operations Section
| Metric | Source | Status |
|--------|--------|--------|
| Queue: Queued | ProcessingJob status=QUEUED | VERIFIED |
| Queue: Running | ProcessingJob status=RUNNING | VERIFIED |
| Queue: Completed | ProcessingJob status=COMPLETED | VERIFIED |
| Queue: Failed | ProcessingJob status=FAILED | VERIFIED |
| Queue: Dead Letter | ProcessingJob status=DEAD_LETTER | VERIFIED |
| Storage: Originals | OrderImage kind=ORIGINAL | VERIFIED |
| Storage: Finals | OrderImage kind=FINAL | VERIFIED |
| Storage: Previews | OrderImage kind=PREVIEW | VERIFIED |
| Restore Failures | RestorationItem status=FAILED | VERIFIED |
| Replicate Failures | RestorationItem with replicate error | VERIFIED |

### 3. Lifetime Totals Section
| Metric | Source | Status |
|--------|--------|--------|
| Total Orders | Order count | VERIFIED |
| Total Paid | Order paymentStatus=PAID | VERIFIED |
| Total Revenue PKR | All payment totals (PKR) | VERIFIED |
| Total Revenue USD | All payment totals (non-PKR) | VERIFIED |
| Total Replicate Cost | ProviderCostLog (flux-restore) | VERIFIED |
| Total Customers | User count | VERIFIED |

## Backend Endpoints Added

| Endpoint | Auth | Returns |
|----------|------|---------|
| `GET /admin/business-metrics?hours=24` | Admin (SUPER_ADMIN) | BusinessMetrics object |
| `GET /admin/analytics?hours=24` | Admin (SUPER_ADMIN) | Same as business-metrics |

## Frontend API Extensions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `adminApi.businessMetrics(hours)` | `GET /api/admin/business-metrics?hours=` | Returns full business metrics |
| `adminApi.analytics(hours)` | `GET /api/admin/analytics?hours=` | Same response, alias |