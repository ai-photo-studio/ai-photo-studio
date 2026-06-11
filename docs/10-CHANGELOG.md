# Changelog

## 2026-06-11 - Phase D WhatsApp Media Intake and Processing Foundation Added
- Added WhatsApp media metadata retrieval, mime and size validation, original R2 storage, and queue submission for uploaded images.
- Added a BullMQ worker that copies originals into placeholder processed outputs and persists delivery links on the order.
- Added retention cleanup for original and processed media plus log-only notification events for received, processing, completed, and failed states.
- Added detailed admin order inspection for files, jobs, and status history.

## 2026-06-03 - Phase 2 WhatsApp Image Flow Added
- Added WhatsApp image message support with media download, original upload, queue handoff, background-remover call, processed image upload, and outbound image reply.
- Reused the existing BullMQ queue and storage flow; no second queue was introduced.
- Added a local smoke test for the image flow and updated deployment/testing notes.

## 2026-06-03 - Phase 1 Background Remover Added
- Added a local-only FastAPI background remover service under `services/background-remover`.
- Exposed `GET /health`, `POST /remove-bg`, and `POST /product-white`.
- Added a local smoke test script and documented the Phase 1 deployment notes.

## 2026-06-03 - R2 Credentials Fixed and Flow Verified
- Replaced Railway `production/api` R2 credentials with bucket-scoped write-enabled credentials for `ai-photo-studio-whatsapp-r2`.
- Verified names-only Railway variable checks and confirmed storage/payment/AI mode: `STORAGE_PROVIDER=r2`, `PAYMENT_GATEWAY_NAME=manual`, `AI_PROVIDER_NAME=mock`.
- Passed Railway-context R2 write/delete smoke test.
- Completed scoped redeploy to Railway `production/api` and confirmed `/api/health` + `/api/version` production smoke tests.
- Completed dummy order flow: create order, attach image input, approve manual payment, mock AI completion, and final output upload confirmed in real R2.

## 2026-06-02 - Admin Manual Approval Path
- Added a minimal admin-only manual payment approval route for manual payment mode.
- The route reuses existing payment/order transition logic and enqueues the existing processing flow.
- Railway auth dropped again during validation, so production redeploy and live approval smoke testing are blocked until Railway is re-authenticated.
# 2026-06-02
- Added real Cloudflare R2 storage wiring in the API storage layer and worker upload path.
- Manual payment mode and mock AI remain enabled for production testing.
- Live R2 object upload smoke test currently returns `AccessDenied` with the provided Railway R2 credentials, so the flow is blocked on write permissions.
