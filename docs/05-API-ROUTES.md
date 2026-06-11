# API Routes (Planned MVP)

## Health
- `GET /health`
  - Service health check for platform/runtime.
- `GET /api/health`
  - API health check for deployed service.
- `GET /api/version`
  - API version and environment metadata.

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
- `POST /webhooks/payments`
  - Payment provider webhook callback.
- `POST /webhooks/payment`
  - Current mock payment webhook receiver.
- `GET /payments/:orderNo/status`
  - Return latest payment state for order.

## Admin (MVP-only ops views)
- `GET /admin/orders`
- `GET /admin/orders/:id`
  - Returns the order, files, jobs, and status history.
- `GET /admin/dashboard`
- `GET /admin/failed-jobs`
- `GET /admin/jobs`
- `POST /admin/orders/:id/retry`
- `POST /admin/orders/:id/send-again`
- `POST /admin/jobs/:id/retry`
