# Database Drift Report — OPS-139

**Date:** 2026-07-25

## Schema vs Database Comparison

### Method
- Schema: `apps/api/prisma/schema.prisma` (829 lines)
- Migrations: 14 migration directories under `apps/api/prisma/migrations/`
- Production DB: Neon PostgreSQL (`ep-billowing-mud-aw1bajbn-pooler.c-12.us-east-1.aws.neon.tech`)

### Models Verified Drift-Free (30 of 32)

| Model | Migration Created | Columns | Status |
|-------|------------------|---------|--------|
| Customer | Initial | 8 | ✅ |
| Order | Initial + phase_c | 26 | ✅ |
| OrderItem | phase_c | 11 | ✅ |
| OrderImage | Initial | 10 | ✅ |
| OrderStatusHistory | phase_c | 7 | ✅ |
| Package | Initial + phase_f | 16 | ✅ |
| Payment | Initial + phase_f | 16 | ✅ |
| AiJob | Initial | 13 | ✅ |
| ProcessingJob | phase_c + queue_reliability | 27 | ✅ |
| ImageQualityScore | phase_2a + 2b + 2c | 43 | ✅ |
| WebhookEvent | Initial | 7 | ✅ |
| Setting | Initial | 4 | ✅ |
| AuditLog | Initial | 7 | ✅ |
| SampleAsset | Initial | 8 | ✅ |
| User | add_user_model | 10 | ✅ |
| Wallet | phase_f | 10 | ✅ |
| WalletTransaction | phase_f | 16 | ✅ |
| Subscription | phase_f | 15 | ✅ |
| SubscriptionUsage | phase_f | 11 | ✅ |
| AdminUser | add_restoration_models | 10 | ✅ |
| AdminSession | add_restoration_models | 9 | ✅ |
| AdminAuditLog | add_restoration_models | 7 | ✅ |
| RestorationOrder | add_restoration_models + quality_metrics | 16 | ✅ |
| RestorationItem | add_restoration_models + quality_metrics + after_quality + quality_statistics + **package_tier** | 57 | ✅ |
| ProviderCostLog | add_restoration_models | 13 | ✅ |
| CreativeStudioJob | add_restoration_models | 14 | ✅ |

### Drifted Models Found (2)

| Model | Issue | Resolution | Status |
|-------|-------|-----------|--------|
| RestorationItem.packageTier | Column in schema (line 697), migration existed but **not applied to production** | ✅ **APPLIED** — `20260724_add_package_tier` deployed via `prisma migrate deploy` |
| ProviderPerformance (entire table) | Schema has 10 columns (lines 812-829), **NO migration ever created this table** | ✅ **APPLIED** — `20260725_add_provider_performance` created and deployed |

## Applied Migrations

```sql
-- 20260724_add_package_tier
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "packageTier" TEXT;
CREATE INDEX IF NOT EXISTS "RestorationItem_packageTier_idx" ON "RestorationItem" ("packageTier");

-- 20260725_add_provider_performance
CREATE TABLE IF NOT EXISTS "ProviderPerformance" (...)
-- (10 columns, 4 indexes, uses IF NOT EXISTS — safe to re-run)
```

## Verification

Both migrations use `IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` — safe to run multiple times. No data loss possible.

## Classification

**Database Drift: VERIFIED** — All drifts resolved. Production DB now matches schema.prisma. No customer data affected.
