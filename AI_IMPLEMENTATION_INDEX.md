# AI Implementation Index

## Project Scope Guard
- `npm run scope:check`
- `npm run push:safe`
- `npm run railway:check`
- `npm run r2:check`

Railway project binding:
- Project name: `AI Photo Studio WhatsApp`
- Project ID: `ad62f340-fcfd-4989-b5bb-18753b28d8c8`
- Environment: `production`
- Environment ID: `13228f5e-8af5-4f5e-b57e-b1dfccd567ec`
- R2 account: `85f6a6181b4653c2a45e69cb7ce8a474`
- R2 bucket: `ai-photo-studio-whatsapp-r2`
- Railway linked service: `api`
- Required Railway services: `api`, `postgres`, `redis`

Deployment readiness snapshot:
- Scope check passes for the current repository remote and branch.
- Phase A web customer foundation is present and verified in the API source tree.
- Phase B public customer website is present in the Vite frontend.
- Phase C backend foundation is present for order intake, queueing, and admin monitoring.
- Phase D WhatsApp media intake downloads, validates, stores, and queues original files.
- Phase E AI provider integration routes processed images through a configurable provider abstraction.
- Prisma schema includes the `User` model, optional `Order.userId` relation, `OrderItem`, `ProcessingJob`, and `OrderStatusHistory`.
- Orders store original and processed file metadata, URLs, and retention timestamps.
- Auth endpoints are present: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/auth/me`.
- JWT auth middleware, CORS origin allow-list, and in-memory rate limiting are wired into the API bootstrap.
- Public package listing is available at `GET /api/packages`.
- BullMQ queue scaffolding exists for the `image-processing` queue and dead-letter path.
- WhatsApp image intake now downloads media, validates image type and size, stores originals in R2, and creates processing jobs.
- Processing worker now calls the configured AI provider abstraction, uploads the processed result, and persists delivery URLs on the order.
- Cloudflare R2 upload abstraction exposes `uploadOriginal()`, `uploadProcessed()`, and `generateDownloadUrl()`.
- Admin monitoring includes paginated `/admin/orders`, `/admin/jobs`, `/admin/stats`, and detailed `/admin/orders/:id`.
- Prisma migration `20260611000002_phase_c_order_pipeline` exists in `apps/api/prisma/migrations`.
- `npm run prisma:validate -w apps/api` passes and `npm run build` passes for both API and web workspaces.
- The web app has a Cloudflare Pages SPA fallback via `apps/web/public/_redirects`.
- Railway API deployment remains separate from the frontend and is not migrated to Cloudflare Workers.
- WhatsApp customer flow, admin auth, manual payment flow, and R2 flow remain in place.
- Public customer dashboard and checkout are still deferred.

## Phase A + B + C + D + E Summary
- Web user model fields: `email`, `passwordHash`, `name`, optional `customerId`
- Order linkage: `Order.userId` optional relation to `User`
- Auth endpoints: register, login, refresh, and me
- JWT auth middleware for web users
- CORS origin allow-list via `ALLOWED_ORIGINS`
- Simple in-memory rate limiting
- Public packages endpoint
- Public customer site pages: home, pricing, signup, login
- Protected account shell with persisted JWT session
- Order pipeline tables: `orders`, `order_items`, `processing_jobs`, `order_status_history`
- Order status lifecycle now includes `QUEUED` and `DELIVERED`
- Queue framework: BullMQ `image-processing` queue with retry and dead-letter handling
- R2 abstraction methods: `uploadOriginal()`, `uploadProcessed()`, `generateDownloadUrl()`
- WhatsApp webhook foundation: `POST /webhooks/whatsapp` stores sender number, message ID, and media ID
- Phase D media ingestion: mime validation, size validation, original upload, and queue submission
- Phase E provider routing: `AI_PROVIDER`, `PHOTOROOM_API_KEY`, `FAL_API_KEY`
- Phase E workflows: product and vehicle pipelines with provider-based processing
- Phase E delivery mode: `DELIVERY_MODE=LOG_ONLY|WHATSAPP`
- Admin monitoring APIs: paginated orders, jobs, stats, and order detail views

## Notes
- The repository still contains the earlier WhatsApp-first MVP modules and the Phase 2 background-remover work.
- This index now tracks the customer foundation, the public website layer, and the Phase C/D/E backend pipeline foundation.
