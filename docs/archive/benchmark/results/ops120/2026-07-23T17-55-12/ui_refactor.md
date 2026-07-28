# OPS-120 — Customer UI Refactor

**Date:** 2026-07-23T17:56:01.934Z

## Customer-Facing Page Changes (RestoreOrderPage.tsx)

### Remove from customer view

| Element | File:Line | Replacement |
|---|---|---|
| Approve button | RestoreOrderPage.tsx:131-139 | Remove (admin only) |
| Reject button | RestoreOrderPage.tsx:131-139 | Remove (admin only) |
| Damage score | RestoreOrderPage.tsx:27-33 formatScore() | Remove (admin only) |
| Quality score | RestoreOrderPage.tsx:27-33 formatScore() | Remove (admin only) |
| Internal pipeline labels (ANALYSIS/INPAINT/FACE etc) | RestoreOrderPage.tsx:8-16 STAGES | Replace with: "Processing" |

### Customer page should display

```
Upload (original thumbnail)
  ↓
Package selected (Original / 2X / 4X) + price
  ↓
Payment status (Pending / Paid)
  ↓
Processing... (simplified: single progress bar)
  ↓
Download (Original / 2X / 4X buttons — available after payment + processing)
  ↓
Print products (optional, from restored master)
```

### Admin-Only Pages (Unchanged)

| Route | Purpose |
|---|---|
| /admin/restorations | List all orders |
| /admin/restorations/:id | Order detail with approve/reject, scores, damage analysis |
