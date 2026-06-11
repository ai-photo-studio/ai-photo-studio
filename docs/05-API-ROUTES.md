# API Routes (Planned MVP)

## Health
- `GET /health`
  - Service health check for platform/runtime.
- `GET /api/health`
  - API health check for deployed service.
- `GET /api/version`
  - API version and environment metadata.
- `GET /api/monitoring/health`
  - Production readiness health check with environment and uptime details.
- `GET /api/monitoring/queue`
  - Queue health snapshot including BullMQ counts or dry-run status.
- `GET /api/monitoring/worker`
  - Worker health snapshot including run state and last activity.

## WhatsApp
- `GET /webhooks/whatsapp`
  - Webhook verification endpoint.
- `POST /webhooks/whatsapp`
  - Incoming WhatsApp event intake.
  - Image messages now fetch media metadata, validate mime/size, store the original in R2, and enqueue processing.

## Orders
- `POST /orders`
  - Create order after package + image intake state.
- `GET /orders/:orderNo`
  - Fetch order status for internal/admin usage.
- `POST /orders/:orderNo/images`
  - Attach uploaded image metadata/storage keys to order.
- `POST /orders/:orderNo/checkout`
  - Create checkout link and payment reference for order.

## Payments
- `POST /payments/:orderNo/checkout`
  - Create payment checkout link.
- `POST /payments/create-checkout`
  - Alternate body-driven checkout creation by order number.
- `POST /payments/manual-proof`
  - Customer uploads manual payment proof for review.
- `POST /webhooks/payments`
  - Payment provider webhook callback.
- `POST /webhooks/payment`
  - Current payment webhook receiver.
- `GET /payments/:orderNo/status`
  - Return latest payment state for order.
- `GET /me/wallet`
  - Current customer wallet, recent transactions, and subscription snapshot.
- `GET /me/payments`
  - Paginated current-user payment history and pending payment count.
- `GET /me/subscription`
  - Paginated current-user subscription history and usage summary.

## Admin (MVP-only ops views)
- `GET /admin/orders`
- `GET /admin/orders/:id`
  - Returns the order, files, jobs, and status history.
- `GET /admin/dashboard`
- `GET /admin/stats`
- `GET /admin/failed-jobs`
- `GET /admin/jobs`
- `GET /admin/payments`
- `GET /admin/wallets`
- `GET /admin/subscriptions`
- `GET /admin/packages`
- `POST /admin/orders/:id/retry`
- `POST /admin/orders/:id/send-again`
- `POST /admin/jobs/:id/retry`
- `POST /admin/orders/:id/approve-manual-payment`
- `POST /admin/orders/:id/reject-manual-payment`
- `POST /admin/payments/:id/approve`
- `POST /admin/payments/:id/reject`
- `POST /admin/packages`
  - Create or update a package record for the catalog.
  - Paginated package listing is supported for the commercial UI.
