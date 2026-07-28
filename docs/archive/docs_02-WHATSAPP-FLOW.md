# WhatsApp Flow

## Supported Incoming Event Types
- Text message
- Interactive reply (button/list)
- Image message

## Conversation Sequence
1. Customer sends greeting (`Hi`, `Hello`, etc.).
2. Bot sends service menu (MVP sample options).
3. Customer selects a service category.
4. Bot sends sample asset for that service.
5. Bot sends package options with pricing.
6. Customer selects one package.
7. Bot requests image uploads and minimum quantity.
8. Customer uploads images.
9. Webhook downloads the media, validates it, stores the original in R2, and queues processing.
10. Worker calls the configured AI provider, uploads the processed file, and stores the delivery link on the order.
11. System sends log-only notification events for received, processing, completed, or failed states.
12. Bot sends preview/final delivery link(s) once outbound delivery messaging is enabled.

## State Handling
- Session key: customer phone number + active order reference.
- State transitions:
  - `new` -> `service_selected` -> `package_selected` -> `awaiting_images` -> `payment_pending` -> `queued` -> `processing` -> `completed` -> `delivered`

## Failure Handling
- Unknown message: send short help prompt + menu.
- Invalid package selection: resend valid options.
- Unsupported media: send accepted format guidance and mark the media pipeline failed.
- Webhook retries: use deduplication by event id in `WebhookEvent`.
