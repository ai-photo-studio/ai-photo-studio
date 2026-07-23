# OPS-121: Frontend Commerce Migration

## PART A — Audit Frontend Routing

### Routes Analysis (App.tsx)

| Route | Component | Status | Issue |
|-------|-----------|--------|-------|
| /restore | RestorationHistoryPage | Legacy | Shows history, no package selection |
| /restore/new | RestoreNewPage | Legacy | Upload only, no package/payment step |
| /restore/:orderId | RestoreOrderPage | Legacy | Has Process/Approve/Reject buttons |

### Customer Workflow Components

**Current Legacy Flow:**
1. `/restore/new` - Upload images
2. `/restore/:orderId` - Click "Process" button
3. Approve/Reject internal stages (admin-only)
4. Quality scores displayed to customer

**Required New Flow:**
1. Upload → Package Selection → Payment → Processing → Downloads → Print

### Admin-Only UI Elements Found in RestoreOrderPage.tsx

- Process button (line 314) - triggers restoration
- Approve button (line 325) - customer should not see
- Reject button (line 330) - customer should not see
- Damage score display (line 307-309) - internal only
- Quality score display (line 275-284) - internal only
- Stage breakdown (lines 223-244) - internal pipeline

---

## PART B — Workflow Replacement Status

**NOT VERIFIED** - Legacy workflow still active. Customer UI displays internal pipeline stages (Approve/Reject/Damage score/Quality score) that should be admin-only per project constraint.

### Required Changes:
- Remove Process, Approve, Reject buttons from customer view
- Hide damage/quality score internals from customer
- Add package selection before processing
- Add payment step before processing

---

## PART C — Customer Page Sanitization Status

**NOT VERIFIED** - Customer page still shows:
- Process button (should be removed)
- Approve/Reject buttons (should be removed)
- Damage score display (should be admin-only)
- Quality score display (should be admin-only)

---

## PART D — Download Manager Status

**NOT VERIFIED** - No implementation found for:
- Tracking purchased tiers (Original, 2X, 4X, 6X, 8X, 12X)
- Generating missing tiers from master image
- Preventing Replicate rerun for downloads

---

## PART E — Deployment Verification

See deployment_verification.md