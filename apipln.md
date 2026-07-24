# OPS-122 — Customer Commerce Frontend Replacement

## Summary

**Replaced** legacy restoration customer UI (Upload → Process → Approve → Reject → Download) with new commerce workflow (Upload → Package Selection → Payment → Processing → Downloads → Print).

## Files Modified

- `apps/web/src/pages/RestoreOrderPage.tsx` — Commerce workflow: download tiers, print options, no admin labels
- `apps/web/src/pages/RestoreNewPage.tsx` — Multi-step: upload → package selection → payment → redirect
- `apps/web/src/pages/RestorationHistoryPage.tsx` — Customer dashboard with grouped lists

## Features Removed (from customer UI)

Process, Approve, Reject, Damage score, Quality score, Pipeline stage labels.

## Features Added

Download tiers (Original, 2X, 4X, 6X, 8X, 12X) with Locked/Purchased/Upgrade states. Print options (4×6, 5×7, 8×10, A4, A3, Canvas, Frame, Album). Package selection during upload flow. Payment step after upload.

## Build

typecheck PASS, build PASS. Web bundle: 244.65 kB JS + 24.99 kB CSS.