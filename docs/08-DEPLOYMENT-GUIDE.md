# Deployment Guide

## Target Platform
Railway for the API, PostgreSQL, Redis, and Cloudflare R2. Cloudflare Pages is the home for the public web frontend.

## Services
- API service from `apps/api`
- PostgreSQL plugin/service
- Redis plugin/service
- Optional local-only Phase 1 background remover service from `services/background-remover`
- Web frontend now targets Cloudflare Pages when deployed

## Required Configuration
- API:
  - database URL
  - redis URL
  - WhatsApp webhook credentials
  - payment provider credentials
  - Cloudflare R2 credentials
  - `R2_BUCKET_NAME` for the `ai-photo-studio-whatsapp-r2` bucket
  - background remover API URL for Phase 2 image intake
  - AI provider credentials (optional for placeholder mode)
  - `JWT_SECRET`: secret key for web user JWT tokens
  - `ALLOWED_ORIGINS`: comma-separated CORS origins (for example `https://mystudio.pages.dev,http://localhost:5173`)
  - Phase D media intake limits are code-based and currently enforce supported `jpg`, `jpeg`, `png`, and `webp` uploads
  - `AI_PROVIDER`: selects `mock`, `photoroom`, or `fal`
  - `PHOTOROOM_API_KEY`: required when `AI_PROVIDER=photoroom`
  - `FAL_API_KEY`: required when `AI_PROVIDER=fal`
  - `DELIVERY_MODE`: `LOG_ONLY` or `WHATSAPP`
- Background remover service:
  - local Python runtime with FastAPI, uvicorn, rembg, and pillow
  - test-only local mode for smoke testing the Phase 1 endpoints
- Web:
  - API base URL
  - Cloudflare Pages origin to be added to `ALLOWED_ORIGINS`
  - `apps/web/wrangler.toml` Pages config and `apps/web/public/_redirects` SPA fallback

## Notes
- Do not use Railway local disk for durable image storage.
- Use R2 signed URLs for upload/download workflow.
- Webhook endpoints must be publicly reachable over HTTPS.
- Phase B adds the public website, but the API deployment target remains Railway.
- Phase C adds the order pipeline tables, queue scaffolding, webhook intake foundation, and admin monitoring APIs without moving processing to Cloudflare Workers.
- Phase D extends the webhook into full media ingestion, placeholder processing, and retention cleanup while keeping the API on Railway.
- Phase E adds provider selection, product and vehicle processing modes, and log-only completion notifications.
- Phase F adds wallets, payment abstraction, subscriptions, and manual payment approval without moving the API away from Railway.
- The Phase 1 background remover service is currently local-only and is not part of the Railway deployment yet.
- Phase 2 WhatsApp image intake uses the existing queue and storage flow plus a `POST /product-white` background-remover call.
- Cloudflare Pages should publish the `apps/web/dist` output with the SPA fallback in `apps/web/public/_redirects`.
- Cloudflare Pages config lives in `apps/web/wrangler.toml`.

## Post-Deploy Checks
- API health endpoint response
- API version endpoint response
- WhatsApp webhook verification success
- Payment webhook receipt and signature verification
- Order processing + file cleanup lifecycle
- Admin API availability checks:
  - `/api/admin/dashboard`
  - `/api/admin/orders`
  - `/api/admin/orders/:id`
  - `/api/admin/jobs`
  - `/api/admin/stats`
  - `/api/admin/orders/:id/approve-manual-payment` when `PAYMENT_GATEWAY_NAME=manual`
- Auth API smoke tests:
  - `POST /api/auth/register` - creates a new user
  - `POST /api/auth/login` - returns JWT token
  - `POST /api/auth/refresh` - refreshes token
  - `GET /api/auth/me` - returns current user (requires Bearer token)
  - `GET /api/packages` - returns active packages
- All new endpoints require `JWT_SECRET` to be set in environment
- Frontend smoke checks:
  - `/` renders the public hero and pricing preview
  - `/pricing` renders live package cards
  - `/signup` and `/login` submit against the API
  - `/account` redirects to `/login` when unauthenticated
- Phase D smoke checks:
  - image webhook ingest stores the original media in R2
  - worker processing copies the original into a placeholder processed file
  - processed delivery URL and retention timestamps are persisted on the order
  - cleanup job deletes expired original and processed files
- Phase E smoke checks:
  - startup validates `AI_PROVIDER` and its matching API key
  - worker routes product and vehicle jobs through the provider abstraction
  - admin stats expose processing duration, provider failures, and queue failures

## Production Manual Approval Note
- Manual payment approval is now available via the admin-only route `POST /api/admin/orders/:id/approve-manual-payment`.
- The route is guarded by the configured admin token and only accepts approvals in manual payment mode.
- Production redeploy and live approval smoke testing are completed on Railway `production/api`.

# R2 Storage Notes
- Real R2 storage is wired into the API code path and uses the Cloudflare R2 S3-compatible client.
- Production remains on manual payment and mock AI.
- Railway-context R2 write/delete smoke test is passing with the current bucket-scoped credentials.
