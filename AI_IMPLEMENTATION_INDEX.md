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
- Phase B public customer website is present in the Vite frontend and uses the live packages/auth APIs.
- Phase C backend foundation is present for order intake, queueing, and admin monitoring.
- Phase D WhatsApp media intake downloads, validates, stores, and queues original files.
- Phase E AI provider integration routes processed images through a configurable provider abstraction.
- Phase F commercial readiness now adds wallets, payments, packages, and subscriptions.
- Phase G customer commercial UI adds wallet, payments, and subscription pages plus admin commercial screens and a production readiness dashboard.
- Phase H adds deployment validation hooks, explicit monitoring endpoints, launch readiness documentation, and a production delivery payload adapter.
- Railway production route parity is now restored after fixing the missing `JWT_SECRET` runtime variable and making the public packages query ignore the currently missing live `Package.featured` column.
- Prisma schema includes the `User` model, optional `Order.userId` relation, `OrderItem`, `ProcessingJob`, and `OrderStatusHistory`.
- Orders store original and processed file metadata, URLs, and retention timestamps.
- Auth endpoints are present: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/auth/me`.
- Route registry endpoint is present: `GET /api/version/routes` returns the mounted API paths without secrets.
- JWT auth middleware, CORS origin allow-list, and in-memory rate limiting are wired into the API bootstrap.
- Public package listing is available at `GET /api/packages`.
- Payment endpoints now include checkout creation, manual proof upload, webhook receipt, and order payment status checks.
- Admin endpoints now include paginated payments, wallets, subscriptions, packages, orders, jobs, and stats.
- BullMQ queue scaffolding exists for the `image-processing` queue and dead-letter path.
- WhatsApp image intake now downloads media, validates image type and size, stores originals in R2, and creates processing jobs.
- Processing worker now calls the configured AI provider abstraction, uploads the processed result, and persists delivery URLs on the order.
- Cloudflare R2 upload abstraction exposes `uploadOriginal()`, `uploadProcessed()`, and `generateDownloadUrl()`.
- Admin monitoring includes paginated `/admin/orders`, `/admin/jobs`, `/admin/payments`, `/admin/wallets`, `/admin/subscriptions`, `/admin/stats`, and detailed `/admin/orders/:id`.
- Monitoring endpoints now include `/api/monitoring/health`, `/api/monitoring/queue`, and `/api/monitoring/worker`.
- Customer commercial APIs now expose `/api/me/wallet`, `/api/me/payments`, and `/api/me/subscription` for the authenticated web client.
- Prisma migration `20260611000003_phase_f_wallet_payments` exists in `apps/api/prisma/migrations`.
- `npm run prisma:validate -w apps/api` passes and `npm run build` passes for both API and web workspaces.
- The web app has a Cloudflare Pages SPA fallback via `apps/web/public/_redirects` and a Pages config at `apps/web/wrangler.toml`.
- The production readiness checklist is documented in `docs/11-ENVIRONMENT-CHECKLIST.md`.
- Launch readiness is documented in `LAUNCH_READINESS_CHECKLIST.md` and `docs/12-LOAD-TEST-PLAN.md`.
- Railway API deployment remains separate from the frontend and is not migrated to Cloudflare Workers.
- Railway deployment is controlled from the repo-root `railway.json` so the api service boots the same `tsx` source entrypoint from the monorepo root.
- WhatsApp customer flow, admin auth, manual payment flow, and R2 flow remain in place.
- Customer dashboard shell remains deferred, but customer wallet, payment, and subscription pages are now live in the web app alongside checkout request and proof tracking.
- The admin commercial dashboard is available for operations, including payment approvals, wallet ledgers, subscription usage, and package visibility.
- Final delivery notifications now use a formal payload builder and respect `DELIVERY_MODE=LOG_ONLY|WHATSAPP` with a log-only default.

## Phase A + B + C + D + E + F + G Summary
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
- Wallet system: `wallets`, `wallet_transactions`, credit/debit/refund ledger, reserved balances, and credit grant helpers
- Package catalog: `STARTER`, `PRO`, `BUSINESS`, `DEALER` stored in DB with workflow and credit metadata
- Payment abstraction: `JAZZCASH`, `EASYPAISA`, `MANUAL` via provider factory
- Manual payment workflow: customer proof upload plus admin approve/reject flow
- Subscription framework: `subscriptions`, `subscription_usage`, monthly reset support, and plan limits
- Usage charging: reserve credits when processing starts, settle on completion, release on failure
- Admin commercial endpoints: payments, wallets, subscriptions, and package catalog management
- Customer commercial UI: wallet, payments, and subscription pages with JWT persistence and checkout/proof tracking

## Notes
- The repository still contains the earlier WhatsApp-first MVP modules and the Phase 2 background-remover work.
- This index now tracks the customer foundation, the public website layer, and the Phase C/D/E/F backend pipeline foundation.
