# Pricing Forensics — OPS-131

**Date:** 2026-07-24

## Part D — Pricing Recovery

### Current Production Package Prices (from API)

| Package | Price (PKR) | maxImages | creditsIncluded |
|---------|------------|-----------|-----------------|
| STARTER  | 1,499      | null*     | 0**             |
| PRO      | 3,499      | null*     | 0**             |
| BUSINESS | 6,999      | null*     | 0**             |
| DEALER   | 9,999      | null*     | 0**             |

\* `maxImages` is NULL in production database (intended: 3, 10, 25, 50)
\** `creditsIncluded` returns 0 due to `hydratePackage()` hardcoding; actual DB value unknown (column may not exist in production)

### All Pricing Locations in Repository

| File | Values | Type |
|------|--------|------|
| `apps/api/prisma/seed.ts` | STARTER=1499, PRO=3499, BUSINESS=6999, DEALER=9999 | Database seed (current) |
| `MASTER_PRICING_MODEL.md` | Same 4 tiers, same prices | Approved blueprint (2026-06-13) |
| `apps/api/src/scripts/ops118-acceptance.ts` | Download: Original=250PKR, 2X=350PKR, 4X=500PKR | Download pricing |
| `apps/api/src/scripts/ops120-activate.ts` | Same download prices | Cost savings table |
| `apps/web/src/pages/PricingPage.tsx` | Dynamic: `{pkg.currency} {pkg.price}` from API | Customer-facing UI |

### What Was Searched

- **250, 350, 500, 1000, 1500, 2500, 5000** — Found only in download pricing (250/350/500) and add-on/script references
- **2HD, 4HD, 6HD, 8HD, 10HD, 12HD** — **NOT FOUND** anywhere in the repository
- **STARTER, PRO, BUSINESS, DEALER** — Current 4-tier model from commit `d97b35c` (Phase 1.5 signoff, 2026-06-13)
- **FREE_PREVIEW, BASIC_PACK, SELLER_READY, PREMIUM_LAUNCH** — Legacy codes, deactivated in seed

### Pricing History Timeline

| Date | Commit | Event |
|------|--------|-------|
| 2026-06 | `3641de1` | Initial seed (no maxImages, no featured, no sortOrder) |
| 2026-06-13 | `d97b35c` | **Current 4-tier model introduced**: STARTER/PRO/BUSINESS/DEALER with prices 1499/3499/6999/9999 |
| 2026-07-23 | `0786b19` (OPS-118) | Regional download pricing added (250/350/500 PKR) |
| 2026-07-23 | `edae120` (OPS-120) | Commerce workflow refactored |

### HD Pricing Status

**There was never a separate "HD" pricing tier.** The term "HD" appears only as:
- UI label: `"Download HD PNG"` in `apps/web/src/pages/HomePage.tsx:297`
- Pipeline label: `"HD Pipeline"` in benchmark scripts
- Resolution constant: `downloadDimensions.hd = 2400x2400` in `HomePage.tsx:185`

### Restoration Path (No Data Loss)

The seed correctly sets `maxImages`, `creditsIncluded`, `sortOrder`, `featured`, `workflowType`, `workflowMode`. To restore:

1. **Run the seed against production:**
   ```bash
   cd apps/api
   npx prisma db push  # First ensure columns exist
   npx tsx prisma/seed.ts  # Upserts packages with correct values
   ```

2. **Verify:**
   ```bash
   curl https://api.thannow.com/api/packages | jq '.data[] | {code, price, maxImages, creditsIncluded}'
   ```

3. **DO NOT** change pricing values — seed uses the same prices as current production.

### Classification

**Pricing: FAILED** — Database has `maxImages=null` and columns missing for `featured`, `sortOrder`, `creditsIncluded`, `monthlyCreditLimit`, `workflowType`, `workflowMode`. Seed needs to be re-run against production.

**HD pricing: VERIFIED** — No HD pricing tier ever existed. The term "HD" is a label/resolution constant only.
