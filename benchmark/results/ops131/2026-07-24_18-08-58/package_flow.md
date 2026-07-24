# Package Flow — OPS-131

**Date:** 2026-07-24

## Part C — Package Investigation

### Data Flow

```
Database (PostgreSQL)
  ↓ prisma.package.findMany({ where: { active: true } })
  ↓
PackageService.listPublicPackages()
  ↓ hydratePackage() (adds default values for missing columns)
  ↓
PackageController.listPackages()
  ↓ res.json({ success: true, data: packages })
  ↓ HTTP JSON response
Frontend (React)
  ↓ usePackages() hook
  ↓ apiRequest<PackageSummary[]>("/api/packages")
  ↓
React State (useState<PackageSummary[]>)
  ↓ map() → render pricing cards
PricingPage.tsx
```

### API Response (Verified Live)

```
GET https://api.thannow.com/api/packages

200 OK
[
  { code: "STARTER",  price: "1499", currency: "PKR", maxImages: null, creditsIncluded: 0, ... },
  { code: "PRO",      price: "3499", currency: "PKR", maxImages: null, creditsIncluded: 0, ... },
  { code: "BUSINESS", price: "6999", currency: "PKR", maxImages: null, creditsIncluded: 0, ... },
  { code: "DEALER",   price: "9999", currency: "PKR", maxImages: null, creditsIncluded: 0, ... }
]
```

### HydratePackage Bug

In `apps/api/src/services/package.service.ts:20-29`:

```ts
const hydratePackage = <T extends { sampleAssets: unknown }>(pkg: T) =>
  ({
    ...pkg,
    featured: false,           // OVERWRITES DB value
    sortOrder: 0,              // OVERWRITES DB value  
    creditsIncluded: 0,        // OVERWRITES DB value (should be 10/25/60/100)
    monthlyCreditLimit: 0,     // OVERWRITES DB value (should be 10/25/60/100)
    workflowType: "PRODUCT",   // OVERWRITES DB value
    workflowMode: "PRODUCT_STUDIO"  // OVERWRITES DB value
  });
```

This function always returns `creditsIncluded: 0` regardless of what's in the database. The `packageReadSelect` does NOT select `featured`, `sortOrder`, `creditsIncluded`, `monthlyCreditLimit`, `workflowType`, `workflowMode` — which means these columns may or may not exist in the DB. The function was written as a workaround for missing columns.

### Frontend Rendering

`PricingPage.tsx:43`: `{pkg.currency} {pkg.price}` → renders "PKR 1499" etc.
`PricingPage.tsx:47`: `{pkg.creditsIncluded} included credits` → renders "0 included credits" for ALL packages

### Admin Packages Page

`AdminPackagesPage.tsx` uses `adminApi.packages()` which calls `POST /api/admin/packages` — this is a different endpoint that returns PaginatedResponse format. Not impacted by the hydratePackage bug (it uses admin route with full selection).

### Classification

**Package flow: FAILED** — `creditsIncluded` always shows 0 on pricing page due to `hydratePackage` hardcoding. `maxImages` is null in production database.
