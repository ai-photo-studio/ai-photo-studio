# OPS-123 — Payment Validation

**Date:** 2026-07-24

## Payment Providers

| Provider | PKR | USD | Webhook | Status |
|----------|-----|-----|---------|--------|
| JazzCash | ✅ | ❌ | HMAC | **VERIFIED** |
| EasyPaisa | ✅ | ❌ | HMAC | **VERIFIED** |
| Manual | ✅ | ✅ | N/A | **VERIFIED** |

## Payment Flow States

```
NEW
  ↓ order.packageId set
PAYMENT_PENDING
  ↓ user creates checkout
  ↓ (or submits manual proof)
PENDING (payment record)
  ↓ webhook PAID / admin approves
APPROVED/PAID
  ↓ wallet credited, subscription created, queue enqueued
PROCESSING
  ↓ image processing completes
COMPLETED
```

## Validation Results

| Test | Status | Detail |
|------|--------|--------|
| Checkout creation | ✅ | createCheckout calls provider.createCheckout |
| Duplicate payment prevention | ✅ | finalizeApprovedPayment checks existing status |
| Webhook signature verification | ✅ | HMAC comparison in BasePaymentProvider |
| Webhook non-settlement ignored | ✅ | status=PAID or APPROVED only triggers settlement |
| Manual proof submission | ✅ | recordManualPaymentProof with audit trail |
| Admin approval | ✅ | approvePaymentById → finalizeApprovedPayment |
| Admin rejection | ✅ | rejectPaymentById with order state rollback |
| Wallet credit on payment | ✅ | creditWallet with creditSource=PURCHASED |
| Subscription creation | ✅ | createOrRefreshSubscription for monthly plans |
| WhatsApp notification | ✅ | sendPaymentConfirmed + sendProcessingStarted |
| Order status history | ✅ | OrderStatusHistory model tracks transitions |

## Security

| Check | Status |
|-------|--------|
| Webhook HMAC signed | ✅ VERIFIED |
| Rate limiting on payment | ✅ Global: 120/min |
| Auth on admin approve/reject | ✅ requireAdminAuth with finance role |
| Audit log on every action | ✅ VERIFIED |
| Replayed webhook detection | ✅ payment_webhook_ignored logged for duplicates |
