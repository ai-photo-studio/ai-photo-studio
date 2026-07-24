# OPS-122: Customer Commerce Frontend

## Implementation Summary

Replaced the legacy customer restoration UI with the new commerce workflow.

### Files Modified

| File | Change |
|------|--------|
| `apps/web/src/pages/RestoreOrderPage.tsx` | Complete rewrite - new commerce workflow |
| `apps/web/src/pages/RestoreNewPage.tsx` | Added package selection + payment steps |
| `apps/web/src/pages/RestorationHistoryPage.tsx` | Updated to customer dashboard |

### Customer Workflow Flowchart

```
Upload (/restore/new)
   ↓
Package Selection (step 2 in page)
   ↓
Payment (step 3 in page)
   ↓
Processing (auto-starts, polling shows progress)
   ↓
Downloads (tier selector: Original, 2X, 4X, 6X, 8X, 12X)
   ↓
Print (sizes: 4×6, 5×7, 8×10, A4, A3, Canvas, Frame, Album)
```

### Removed Features (Customer-Facing)

| Feature | Gone From Customer | Accessible Where |
|---------|-------------------|-----------------|
| Process button | ❌ Removed | Admin panel only |
| Approve button | ❌ Removed | Admin panel only |
| Reject button | ❌ Removed | Admin panel only |
| Damage score | ❌ Removed | Admin panel only |
| Quality score | ❌ Removed | Admin panel only |
| Pipeline stage labels | ❌ Removed | Admin panel only |
| Internal metrics | ❌ Removed | Admin panel only |

### Added Features

| Feature | File |
|---------|------|
| Image preview before processing | RestoreOrderPage.tsx |
| Package selection step | RestoreNewPage.tsx |
| Payment step | RestoreNewPage.tsx |
| Download tiers (Original, 2X, 4X, 6X, 8X, 12X) | RestoreOrderPage.tsx |
| Print options (4×6, 5×7, 8×10, A4, A3, Canvas, Frame, Album) | RestoreOrderPage.tsx |
| Customer dashboard with Quick Actions | RestorationHistoryPage.tsx |
| My Restorations list with status grouping | RestorationHistoryPage.tsx |