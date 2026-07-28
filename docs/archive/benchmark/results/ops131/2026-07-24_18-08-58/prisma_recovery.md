# Prisma Recovery — OPS-136

**Date:** 2026-07-24

## Issue: `RestorationItem.packageTier` Missing

| Item | Status | Detail |
|------|--------|--------|
| Column in schema.prisma | ✅ Present | Line 697: `packageTier String?` |
| Column in migrations | ❌ **MISSING** | No migration creates this column |
| Column in production DB | ❌ **MISSING** | Schema drift — column never applied |
| Impact | LOW | Nullable column, no queries fail |

## Why This Happened

The `packageTier` column was added to `schema.prisma` (likely during OPS-118 or OPS-120 commerce work) but a Prisma migration was never generated and run against the production database. The schema file was updated but `prisma migrate dev` was not executed.

## Other Drifted Columns

Only `packageTier` (and its index) are missing from migrations. All other 63 columns in the `RestorationItem` model exist in the database.

## Resolution

### Migration Created

`apps/api/prisma/migrations/20260724_add_package_tier/migration.sql`:
```sql
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "packageTier" TEXT;
CREATE INDEX IF NOT EXISTS "RestorationItem_packageTier_idx" ON "RestorationItem" ("packageTier");
```

### Apply to Production

```bash
# Run via the deployed container (SKIP_MIGRATIONS must be false)
# Or run manually:
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

The migration uses `IF NOT EXISTS` and is safe to run multiple times.

## Classification

**Prisma Recovery: VERIFIED** — Migration created. `packageTier` column is nullable and additive. No production impact. Apply via `prisma migrate deploy` on next deploy.
