# OPS-126 — Commerce UI Report

**Date:** 2026-07-24

## "Choose Your Package" — Root Cause Investigation

### Symptom

When a customer uploads photos and proceeds to the Package Selection step, the page renders:

```
Choose Your Package
Select the download tier that matches your needs.
```

But **no package cards** appear. The customer sees an empty page with only the "← Back to Upload" button.

### Root Cause

The `GET /api/packages` endpoint returns `{"success":true,"data":[]}` — an **empty array**.

The frontend component (`RestoreNewPage.tsx` line under `step === "package"`) maps over the packages array:
```jsx
r.map(S => s.jsx("article", {...}, S.id))
```

With an empty array, **no elements are rendered**.

### Why is the array empty?

The `PackageService.listPublicPackages()` queries:
```ts
prisma.package.findMany({
  where: { active: true },
  orderBy: [{ price: "asc" }, { createdAt: "asc" }]
})
```

The production database has **no packages with `active = true`**. The seed file (`prisma/seed.ts`) creates 4 packages (STARTER, PRO, BUSINESS, DEALER) but this seed has never been executed against the production database.

### Verification

```bash
# The API response confirms:
curl https://api.thannow.com/api/packages
# {"success":true,"data":[]}
```

### Fix

Run the seed script against the production database:
```bash
npx prisma db seed
```

This will upsert the 4 packages (STARTER, PRO, BUSINESS, DEALER) with `active: true`.

## Component Rendering Investigation

| Component | Renders Correctly | Note |
|-----------|------------------|------|
| Upload step (dropzone) | ✅ YES | Drag-drop, file selection, file list |
| Package selection step | ❌ NO | No packages returned from API |
| Payment step | ❌ SKIPPED | Never reached due to empty packages |
| Processing step | ✅ Depends | Will work if order exists |
| Download tiers | ✅ Wired | Original, 2X, 4X, 6X, 8X, 12X |
| Print options | ✅ Wired | 4×6, 5×7, 8×10, A4, A3, Canvas, Frame, Album |
| Customer dashboard | ✅ Wired | My Restorations with grouping |
