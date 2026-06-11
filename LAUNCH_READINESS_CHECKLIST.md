# Launch Readiness Checklist

## Git
- [ ] `git remote` points to `gardenshop/ai-photo-studio-whatsapp`
- [ ] Branch is `main`
- [ ] Git identity is set for the repository
- [ ] `git push origin main` succeeds without force push

## Railway
- [ ] Project is `AI Photo Studio WhatsApp`
- [ ] Environment is `production`
- [ ] Linked service is `api`
- [ ] Required env vars are present
  - [ ] `AI_PROVIDER`
  - [ ] `R2_ACCOUNT_ID`
  - [ ] `R2_BUCKET`
  - [ ] `R2_ACCESS_KEY_ID`
  - [ ] `R2_SECRET_ACCESS_KEY`
  - [ ] `WHATSAPP_ACCESS_TOKEN`
  - [ ] `WHATSAPP_PHONE_NUMBER_ID`
- [ ] Health endpoints respond successfully
  - [ ] `/api/health`
  - [ ] `/api/monitoring/health`
  - [ ] `/api/monitoring/queue`
  - [ ] `/api/monitoring/worker`

## Cloudflare
- [ ] `apps/web/wrangler.toml` exists
- [ ] `apps/web/public/_redirects` exists
- [ ] Vite build output is generated successfully
- [ ] Cloudflare Pages origin is allowed in API CORS

## WhatsApp
- [ ] Webhook verification token configured
- [ ] Access token configured
- [ ] Phone number ID configured
- [ ] `DELIVERY_MODE` defaults to `LOG_ONLY`
- [ ] `WHATSAPP` mode payload generation is verified

## R2
- [ ] Bucket name is `ai-photo-studio-whatsapp-r2`
- [ ] Account ID is configured
- [ ] Access and secret keys are present
- [ ] Signed upload/download flow is ready

## AI Providers
- [ ] `AI_PROVIDER` set
- [ ] `PHOTOROOM_API_KEY` present when `AI_PROVIDER=photoroom`
- [ ] `FAL_API_KEY` present when `AI_PROVIDER=fal`

## Monitoring
- [ ] Queue health endpoint returns expected counts or dry-run state
- [ ] Worker health endpoint shows running state
- [ ] Admin dashboard metrics render correctly

## Backups
- [ ] Database backup and restore plan documented
- [ ] R2 retention windows documented
- [ ] Manual payment records and audit trail retention confirmed
