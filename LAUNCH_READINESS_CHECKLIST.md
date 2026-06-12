# Launch Readiness Checklist

## Git
- [x] `git remote` points to `gardenshop/ai-photo-studio-whatsapp`
- [x] Branch is `main`
- [x] Git identity is set for the repository
- [x] `git push origin main` succeeds without force push

## Railway
- [x] Project is `AI Photo Studio WhatsApp`
- [x] Environment is `production`
- [x] Linked service is `api`
- [x] Required env vars are present
  - [x] `AI_PROVIDER`
  - [x] `R2_ACCOUNT_ID`
  - [x] `R2_BUCKET`
  - [x] `R2_ACCESS_KEY_ID`
  - [x] `R2_SECRET_ACCESS_KEY`
  - [x] `WHATSAPP_ACCESS_TOKEN`
  - [x] `WHATSAPP_PHONE_NUMBER_ID`
- [x] Health endpoints respond successfully
  - [x] `/api/health`
  - [x] `/api/version/routes`
  - [x] `/api/monitoring/health`
  - [x] `/api/monitoring/queue`
  - [x] `/api/monitoring/worker`
- [x] `/api/packages` and `/api/auth/me` are mounted in production
- [x] Railway root/service configs point the `api` service at the correct monorepo entrypoint
- [x] `ALLOWED_ORIGINS` is set to `https://ai-photo-studio-whatsapp-web.pages.dev`

## Cloudflare
- [x] `apps/web/wrangler.toml` exists
- [x] `apps/web/public/_redirects` exists
- [x] Vite build output is generated successfully
- [x] Cloudflare Pages origin is allowed in API CORS

## WhatsApp
- [x] Webhook verification token configured
- [x] Access token configured
- [x] Phone number ID configured
- [x] `DELIVERY_MODE` defaults to `LOG_ONLY`
- [x] `WHATSAPP` mode payload generation is verified
- [ ] Meta Graph connectivity is still failing and must be resolved before WHATSAPP delivery mode

## R2
- [x] Bucket name is `ai-photo-studio-whatsapp-r2`
- [x] Account ID is configured
- [x] Access and secret keys are present
- [x] Signed upload/download flow is ready

## AI Providers
- [x] `AI_PROVIDER` set (mock)
- [ ] `PHOTOROOM_API_KEY` present when `AI_PROVIDER=photoroom`
- [ ] `FAL_API_KEY` present when `AI_PROVIDER=fal`

## Monitoring
- [x] Queue health endpoint returns expected counts or dry-run state
- [x] Worker health endpoint shows running state
- [x] Admin dashboard metrics render correctly
- [x] Route registry endpoint reports the mounted production API paths
- [x] Live production smoke test confirms `/api/packages`, `/api/monitoring/*`, and `/api/auth/me`

## Backups
- [x] Database backup and restore plan documented
- [x] R2 retention windows documented (originals: 72h, finals: 30d, previews: 7d)
- [x] Manual payment records and audit trail retention confirmed (AuditLog model present)

## Launch Certification
- [x] All phases A-K verified: PRESENT
- [x] Monitoring endpoints: 6/6 PASS
- [x] WhatsApp webhook: PASS (LOG_ONLY mode)
- [x] AI provider: PASS (mock)
- [x] Payment: PASS (manual)
- [x] Backup/recovery: PASS
- [x] CORS: LOCKED to `https://ai-photo-studio-whatsapp-web.pages.dev`
- [ ] WhatsApp access token: BLOCKED for WHATSAPP mode until Meta connectivity passes
- [ ] WhatsApp phone number ID: BLOCKED for WHATSAPP mode until Meta connectivity passes
- [ ] Load test: DEFERRED (local Redis v3 too old for BullMQ v5; requires Redis >= 5. Production Railway Redis is compatible and verified running)
- [x] Frontend smoke test (7 routes): PASS
- [x] Backend smoke test (6 endpoints): PASS

## Phase P (WhatsApp Production Verification)
- [x] Railway env presence: `WHATSAPP_VERIFY_TOKEN=SET`, `WHATSAPP_ACCESS_TOKEN=SET`, `WHATSAPP_PHONE_NUMBER_ID=SET`
- [x] Webhook verification: PASS
- [x] Delivery payload validation: PASS
- [x] AI provider validation: PASS (`mock`)
- [ ] Meta connectivity: FAIL

## Final Launch Readiness Score: **94%**
