# Database Schema (MVP)

## Planned Models
- `Customer`: WhatsApp identity and profile metadata
- `Order`: commercial transaction envelope
- `OrderImage`: source and output image references per order
- `Payment`: payment lifecycle records
- `Package`: service package catalog
- `Wallet`: customer credit balance and lifetime totals
- `WalletTransaction`: credit/debit/refund ledger
- `Subscription`: monthly plan activation and limits
- `SubscriptionUsage`: per-period usage tracking and resets
- `SampleAsset`: media shown during package selection
- `AiJob`: queue processing units and execution state
- `WebhookEvent`: inbound webhook event store for idempotency/audits
- `Setting`: runtime configurable key/value settings
- `AuditLog`: admin/system audit trail

## Relational Notes
- One `Customer` to many `Order`.
- One `Order` to many `OrderImage`.
- One `Order` to many `Payment` attempts.
- One `Order` to many `AiJob`.
- One `Package` to many `Order`.
- One `User` to one `Wallet`.
- One `Wallet` to many `WalletTransaction`.
- One `User` to many `Subscription` records.
- One `Subscription` to many `SubscriptionUsage` records.

## Indexing Focus
- `Customer.whatsappNumber` unique
- `Order.orderNo` unique
- `Payment.providerRef` index
- `Wallet.userId` unique
- `WalletTransaction.referenceType + referenceId`
- `Subscription.userId + status`
- `WebhookEvent.providerEventId` unique
- Time-based indexes on `createdAt` for ops dashboards

## Data Retention Pointers
- Original images: 24h
- Finals: 72h
- Previews: 7 days
- Physical deletion handled by storage cleanup worker
- Wallet ledger data is retained for accounting/audit purposes.
