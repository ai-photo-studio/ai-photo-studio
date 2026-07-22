# Launch Checklist

**Target:** Production deployment of AI Photo Studio restoration pipeline  
**Date:** 2026-07-22

---

## Pre-Launch Requirements

### Infrastructure
- [ ] Cloud Run services deployed and healthy
- [ ] Redis instance running and accessible
- [ ] PostgreSQL database migrated to latest schema
- [ ] R2 bucket configured with correct CORS policy
- [ ] Cloudflare DNS configured for all domains
- [ ] API domain (`api.thannow.com`) DNS-only CNAME to Cloud Run

### Secrets
- [ ] `OPENAI_API_KEY` — OpenAI account with billing enabled
- [ ] `FAL_AI_API_KEY` — fal.ai account with balance
- [ ] `REPLICATE_API_TOKEN` — Replicate account with credits
- [ ] `RUNPOD_API_KEY` — RunPod API key
- [ ] `RESTORATION_ENDPOINT_URL` — RunPod worker endpoint URL
- [ ] `WHATSAPP_ACCESS_TOKEN` — WhatsApp Business API token
- [ ] `WHATSAPP_PHONE_NUMBER_ID` — WhatsApp phone number ID
- [ ] `JWT_SECRET` — JWT signing secret
- [ ] `ADMIN_JWT_SECRET` — Admin JWT signing secret
- [ ] `R2_ACCOUNT_ID` — Cloudflare R2 account ID
- [ ] `R2_ACCESS_KEY_ID` — R2 access key
- [ ] `R2_SECRET_ACCESS_KEY` — R2 secret key
- [ ] `R2_BUCKET_NAME` — R2 bucket name

### Provider Configuration
- [ ] OpenAI: Billing limit set, `dall-e-3` model accessible
- [ ] fal.ai: Balance topped up, `fal-ai/image-editing/photo-restoration` endpoint accessible
- [ ] Replicate: Credits added, `sczhou/codeformer` model accessible
- [ ] RunPod: Worker deployed, endpoint URL configured

### Environment Variables
- [ ] `PROVIDER_MODE=automatic` (or `manual` for initial rollout)
- [ ] `QUEUE_TIMEOUT_SECONDS=60`
- [ ] `PROCESSING_TIMEOUT_SECONDS=90`
- [ ] `ABSOLUTE_TIMEOUT_SECONDS=150`
- [ ] `DELIVERY_MODE=LOG_ONLY` (initial) or `WHATSAPP` (production)

### Monitoring
- [ ] Health check endpoint responding
- [ ] Logging configured (stdout/stderr)
- [ ] Error tracking configured
- [ ] Provider metrics collection enabled

### Testing
- [ ] Unit tests: 89/89 passing
- [ ] Integration test: Full workflow validated
- [ ] Provider certification: All providers authenticated
- [ ] Golden benchmark: Results documented

---

## Launch Sequence

1. **Deploy API** — `gcloud run deploy`
2. **Deploy Worker** — RunPod worker container
3. **Verify health** — Check all provider health endpoints
4. **Test workflow** — Submit test image through full pipeline
5. **Monitor logs** — Watch for errors in first 10 minutes
6. **Gradual rollout** — Start with `PROVIDER_MODE=manual` using RunPod only
7. **Enable commercial providers** — Switch to `automatic` after validation
8. **Enable WhatsApp delivery** — Change `DELIVERY_MODE` to `WHATSAPP`

---

## Rollback Plan

If issues detected within first 30 minutes:
1. Revert `PROVIDER_MODE` to `manual`
2. Set primary provider to `runpod` only
3. Disable commercial providers in policy engine
4. Investigate logs and provider errors
5. If critical: revert to previous deployment

---

## Sign-Off

| Role | Name | Signature | Date |
|---|---|---|---|
| Engineering Lead | | | |
| DevOps | | | |
| QA | | | |
| Product | | | |
