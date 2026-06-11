# Testing Checklist (MVP)

## Documentation and Structure
- [ ] All required docs exist and reflect implemented scope.
- [ ] Changelog updated after each implementation step.
- [ ] Confirm `.gitignore` blocks all `*.md` and `docs/` from staging.
- [ ] Confirm Railway project guard values match target project name and project ID.
- [ ] Confirm Railway linked service is `api`.
- [ ] Confirm required Railway services exist: `api`, `Postgres`, `Redis`.
- [ ] Confirm GitHub auth account can push to `gardenshop/ai-photo-studio-whatsapp`.

## Build and Static Validation
- [ ] `npm install`
- [ ] `npm run build`
- [ ] `npm run typecheck` (if available)
- [ ] `npm run lint` (if available)
- [ ] `npm run prisma:validate -w apps/api`
- [ ] `npm run prisma:generate -w apps/api`
- [ ] `npm run deploy:ready` passes in authenticated environment
- [ ] Railway `api` deployment passes `/api/health` healthcheck after production env vars are configured
- [ ] Railway API service has all required runtime env vars set from `.env.railway.production.example` placeholders
- [ ] Public API domain is attached before validating WhatsApp webhook callbacks
- [ ] Railway link is confirmed to `AI Photo Studio WhatsApp` / `production` / `api` before redeploy
- [ ] `npm run railway:vars:check` reports required variable names as `PRESENT`
- [ ] `npm run wrangler:r2:check` confirms Wrangler availability and expected R2 bucket presence
- [ ] Manual payment first boot supported with `PAYMENT_GATEWAY_NAME=manual`
- [ ] Mock storage first boot supported with `STORAGE_PROVIDER=mock`
- [ ] Admin manual approval route works in production: `POST /api/admin/orders/:id/approve-manual-payment`
- [ ] `AI_PROVIDER` validation fails fast when provider keys are missing for `photoroom` or `fal`

## API Functional Checks
- [ ] `GET /health` returns success.
- [ ] `GET /api/health` returns success message payload.
- [ ] `GET /api/version` returns build/version metadata.
- [ ] `GET /api/monitoring/health` returns environment and uptime metadata.
- [ ] `GET /api/monitoring/queue` returns queue health or dry-run status.
- [ ] `GET /api/monitoring/worker` returns worker health status.
- [ ] WhatsApp verification endpoint responds correctly.
- [ ] WhatsApp webhook intake stores event records.
- [ ] WhatsApp image webhook intake detects image messages, downloads media, validates mime/size, stores originals in R2, and enqueues the processing job.
- [ ] Order creation endpoint creates order + image records.
- [ ] `POST /api/orders/:orderNo/images` stores `OrderImage` rows.
- [ ] `POST /api/orders/:orderNo/checkout` returns checkout URL + payment reference.
- [ ] `POST /api/payments/manual-proof` creates or updates a pending manual payment record.
- [ ] Payment checkout endpoint returns payment link.
- [ ] Payment webhook marks order paid, credits wallet, and enqueues jobs.
- [ ] `GET /api/payments/:orderNo/status` returns latest payment status.
- [ ] Admin manual approval endpoint moves a pending manual order to processing.
- [ ] Admin payment, wallet, subscription, and package list endpoints return paginated data.
- [ ] Phase 1 background remover local smoke test passes via `services/background-remover/scripts/test_local.py`.

## Worker and Processing Checks
- [ ] Queue accepts jobs for processed WhatsApp media.
- [ ] Worker copies original files into placeholder processed outputs.
- [ ] Delivery URL is generated and stored on the order record.
- [ ] Cleanup worker deletes expired originals after 72 hours and processed files after 30 days.
- [ ] Phase D WhatsApp media worker uploads processed output, logs notification events, and marks the order complete or failed.
- [ ] Phase E worker routes product and vehicle jobs through the provider abstraction.
- [ ] Phase F worker reserves credits at processing start and settles or releases them on completion/failure.
- [ ] Phase F payment, wallet, subscription, and package endpoints return paginated data.
- [ ] `GET /api/admin/stats` returns processing duration and failure metrics.

## Admin Web Checks
- [ ] Dashboard loads summary KPIs.
- [ ] Orders list and detail pages render expected fields.
- [ ] Failed jobs list supports retry action.
- [ ] Order detail actions work:
  - Retry Failed Images
  - Send Delivery Again
- [ ] Admin order detail returns files, jobs, and status history.
- [ ] Admin payment, wallet, and subscription pages can be backed by the new endpoints.
- [ ] Customer wallet page shows balance, ledger history, and subscription snapshot.
- [ ] Customer payments page can create checkout requests, submit proof metadata, and track payment status.
- [ ] Customer subscription page shows plan usage and monthly reset information.
- [ ] Admin commercial pages support pagination for payments, wallets, subscriptions, and packages.
- [ ] Admin dashboard displays queue depth, active workers, failed jobs, processing duration, payment approvals, and wallet usage.
- [ ] Launch readiness checklist documents GitHub, Railway, Cloudflare, WhatsApp, R2, AI provider, monitoring, and backups.
# R2 Verification
- Confirmed `STORAGE_PROVIDER=r2` is set on Railway production/api.
- Build and deploy readiness pass.
- Live R2 write/delete smoke test now passes from Railway `production/api` context.
- Dummy order flow now confirms final output upload to real R2 while keeping `PAYMENT_GATEWAY_NAME=manual` and `AI_PROVIDER_NAME=mock`.

## Phase 1 Background Remover
- Local service exists under `services/background-remover`.
- Endpoints available:
  - `GET /health`
  - `POST /remove-bg`
  - `POST /product-white`
- Local smoke test uses the service's test-mode bypass so it does not depend on a fresh rembg model download during validation.

## Phase 2 WhatsApp Image Flow
- Local smoke test script: `npx tsx scripts/test-whatsapp-image-flow.ts`
- Verifies webhook image intake, queue enqueue, background removal, processed image upload, and outbound image send behavior with fakes.
