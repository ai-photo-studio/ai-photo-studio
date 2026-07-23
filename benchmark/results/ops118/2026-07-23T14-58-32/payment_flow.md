# Payment Flow

**Date:** 2026-07-23T14:59:23.396Z

## Customer Journey

```
Upload Image
  ↓
Replicate Restore (3 stages)
  ↓
Watermarked Preview Generated
  ↓
Customer views preview on Preview Page
  ↓
Customer selects: DOWNLOAD or PRINT
  ↓
## DOWNLOAD FLOW
Select package tier (Original / 2X / 4X)
  ↓
Payment: JazzCash / EasyPaisa / Manual Proof
  ↓
Payment verification (webhook / manual approval)
  ↓
Generate signed download URL (15 min expiry)
  ↓
Customer downloads

## PRINT FLOW
Select print options (size, paper, finish, frame, qty)
  ↓
Enter shipping address
  ↓
Select courier
  ↓
Payment
  ↓
Order confirmation
```

## Payment Gateways

| Gateway | Currency | Merchant | Status |
|---|---|---|---|
| Bank Alfalah | PKR | PKR Merchant | CONFIGURED |
| Bank Alfalah | USD | USD Merchant | CONFIGURED |
| JazzCash | PKR | JazzCash | IMPLEMENTED (existing) |
| EasyPaisa | PKR | EasyPaisa | IMPLEMENTED (existing) |
| Manual Proof | PKR/USD | N/A | IMPLEMENTED (existing) |

## Currency Routing

Region detection → determines currency (PKR/USD) → determines merchant account.
Pricing displayed in local currency. Payment processed on the corresponding merchant.

## Security

- Download URLs are S3 R2 presigned URLs (15-minute expiry)
- URLs are generated only after payment verification
- Token-based authorization via `requireAuth` middleware