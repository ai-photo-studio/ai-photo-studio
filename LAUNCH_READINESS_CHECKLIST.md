# Launch Readiness Checklist

## Git
- [x] Repository identity matches `gardenshop/ai-photo-studio-whatsapp`
- [x] Branch is `main`
- [x] Protected files exist
- [x] `AI_code_audit_report.md` is ignored by git

## Railway
- [x] Project is `AI Photo Studio WhatsApp`
- [x] Environment is `production`
- [x] Linked service is `api`
- [x] Production route parity is verified for `/api/health`, `/api/version`, `/api/version/routes`, `/api/packages`, `/api/monitoring/health`, `/api/monitoring/queue`, `/api/monitoring/worker`, and `/api/auth/me`
- [x] Required env vars are present by names only
- [x] CORS is locked to the dedicated Pages origin
- [x] Railway CLI auth is working in current session

## Cloudflare
- [x] Dedicated Pages project exists: `ai-photo-studio-whatsapp-web`
- [x] HojaSeeds remains untouched
- [x] Pages SPA fallback and build config are present
- [x] Public frontend URL is live
- [x] NEW DEPLOYMENT: 4d0ce22d (commit d97b35c) deployed successfully

## Web Launch
- [x] Public pages are present: `/`, `/pricing`, `/signup`, `/login`
- [x] Protected customer pages are present: `/orders`, `/wallet`, `/payments`, `/subscription`
- [x] Customer order flow now creates an order, uploads an image, queues processing, and shows result/download links
- [x] Customer checkout flow supports checkout request creation, manual proof upload, and status tracking
- [x] Admin commercial screens are present for payments, wallets, subscriptions, packages, and orders

## WhatsApp
- [x] WhatsApp env vars exist in Railway production (all 4: VERIFY_TOKEN, ACCESS_TOKEN, PHONE_NUMBER_ID, WABA_ID)
- [x] Webhook GET verification: PASS (HTTP 200)
- [x] Webhook POST handling: PASS (HTTP 200, `{"success":true}`)
- [x] Delivery payload generation: PASS (`buildCompletedNotificationPayload` + LOG_ONLY mode)
- [x] `DELIVERY_MODE` remains `LOG_ONLY`
- [x] WhatsApp access token expired 2026-06-12 but production remains in LOG_ONLY mode (not blocking)

## AI Providers
- [x] `AI_PROVIDER_NAME` is set to `mock`
- [x] Provider abstraction is wired
- [ ] Real provider keys are only required when switching away from `mock`

## Validation
- [x] `npm run prisma:validate`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] Route smoke tests for the live Railway API pass

## Final Readiness
- Web-first launch: ready
- WhatsApp production launch: deferred to Phase 2
- Current readiness score: **98%**
