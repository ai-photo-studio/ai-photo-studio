# R9.2 P4E Protocol

The customer order review page displays immutable server-owned order facts and exposes one explicit `Pay securely` action. The action posts `{ orderNo }` to `/api/orders/:orderNo/checkout`; it never accepts client amount, currency, merchant, session, or status fields. The page uses `/api/orders/:orderNo/payment-status` for read-only status checks.

`PAYMENT_PROVIDER_UNAVAILABLE` is rendered as unavailable. Query and return values are ignored, refresh performs GET only, duplicate clicks are disabled while the request is pending, and mocked hosted sessions redirect only after the explicit action. Ownership remains enforced by the existing authenticated or guest-token API boundary.

This protocol does not implement webhooks, card handling, capture, production activation, live MPGS calls, RunPod, or payment-to-P4A application.
