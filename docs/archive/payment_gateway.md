# Payment Gateway Architecture

## Provider

**Primary:** Bank Alfalah
**Currencies:** PKR (local), USD (international)
**JazzCash:** Supported through Bank Alfalah's official JazzCash collection (no separate integration needed)

## Flow

```
User selects resolution/package
  ↓
Select Payment Method
  ├── Bank Alfalah (credit/debit card)
  └── JazzCash (via Bank Alfalah)
  ↓
Create payment request
  ↓
User completes payment
  ↓
Payment webhook → order.status = "APPROVED"
  ↓
POST /api/restorations/:id/items/:id/process
  (payment guard passes: APPROVED | COMPLETED)
  ↓
PipelineOrchestrator → Replicate
```

## Payment Guard

The `processItem` endpoint requires:
```typescript
order.status === "APPROVED" || order.status === "COMPLETED"
```
If payment is not approved, returns HTTP 402 `PAYMENT_REQUIRED`.

## Frontend Payment Step

Located in `RestoreNewPage.tsx` (`step === "payment"`):
- Shows selected resolution/package name and price
- "Complete Payment" button → `navigate("/restore/:orderId")`
- Processing always waits for backend payment approval

## Implementation Status
- Payment method selector: Not yet implemented (stub)
- Bank Alfalah integration: Not yet implemented (stub)
- Payment webhook: Not yet implemented (stub)
- JazzCash collection: Not yet implemented (stub)

The payment guard on `processItem` is active but no actual payment provider is connected yet.
