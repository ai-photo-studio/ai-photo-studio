# OPS-121: Customer Journey Mapping

## Current (Legacy) Journey

```
Upload (/restore/new)
   ↓
Process button (customer clicks)
   ↓
Approve/Reject (admin steps visible to customer)
   ↓
Download
```

## Required (New) Journey

```
Upload (/restore/new)
   ↓
Package Selection
   ↓
Payment
   ↓
Processing
   ↓
Downloads
   ↓
Print
```

## Status Summary

| Step | Legacy | New Required | Status |
|------|--------|--------------|--------|
| Upload | RestoreNewPage.tsx | RestoreNewPage.tsx | EXISTS |
| Package Selection | Missing | Missing | NOT VERIFIED |
| Payment | PaymentsPage.tsx | PaymentsPage.tsx | EXISTS (separate route) |
| Processing | RestoreOrderPage with Process button | RestoreOrderPage with status | EXISTS |
| Downloads | RestoreOrderPage with Download button | Multi-tier download manager | PARTIAL |
| Print | Missing | Print page/component | NOT VERIFIED |

**CONCLUSION:** Legacy workflow is still active. Customer UI displays internal pipeline labels (Process, Approve, Reject, Damage score, Quality score) that should be admin-only.