# Payment Flow

## Objective
Support pluggable payment providers while keeping order/payment state transitions consistent.

## Abstraction Contract
- `PaymentProvider.createCheckout(order)`
- `PaymentProvider.verifyWebhook(payload, headers)`
- `PaymentProviderFactory` selects `jazzcash`, `easypaisa`, or `manual`

Implemented currently as:
- `JazzCashPaymentProvider`
- `EasyPaisaPaymentProvider`
- `ManualPaymentProvider`

## Flow
1. Order created with `paymentStatus = PENDING`.
2. Checkout link requested and sent to customer.
3. Manual customer proof can be uploaded at `POST /api/payments/manual-proof`.
4. Provider webhook is received or manual proof is approved by admin.
5. Success event marks:
   - `payment.status = APPROVED` or `PAID`
   - `order.paymentStatus = PAID`
   - `order.orderStatus = PROCESSING`
6. Wallet credit is applied for web users, and subscriptions are created or refreshed.
7. Processing jobs are enqueued.
8. Delivery is initiated after successful processing.

## Safety
- Log webhook payload metadata in `WebhookEvent`.
- Enforce idempotency by provider event id.
- Store raw amounts/currency/provider refs in `Payment`.
- Manual payment approval requires admin auth.
- Wallet credits are reserved when processing starts, settled on completion, and released on failure.
