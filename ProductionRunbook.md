# Production Runbook

**Version:** 1.0  
**Date:** 2026-07-22

---

## Overview

This runbook describes operational procedures for the AI Photo Studio restoration pipeline in production.

## Architecture

```
WhatsApp → API (Cloud Run) → Queue (Redis) → Worker → Providers
                                                     ├── RunPod (primary for preview/basic/archive)
                                                     ├── OpenAI DALL-E 3 (primary for premium/print)
                                                     ├── fal.ai (fallback for premium/print)
                                                     └── Replicate CodeFormer (face restoration)
```

## Daily Operations

### Health Check

```bash
# Check API health
curl https://api.thannow.com/health

# Check provider health (via API)
curl https://api.thannow.com/api/providers/health

# Check Cloud Run services
gcloud run services list --region=us-central1
```

### Monitor Queue

```bash
# Check Redis queue length
redis-cli -h $REDIS_HOST LLEN restoration_queue

# Check processing items
redis-cli -h $REDIS_HOST ZCOUNT restoration_processing 0 -1
```

### Monitor Database

```bash
# Check pending items
psql $DATABASE_URL -c "SELECT COUNT(*) FROM restoration_item WHERE status = 'PROCESSING'"

# Check failed items
psql $DATABASE_URL -c "SELECT COUNT(*) FROM restoration_item WHERE status = 'FAILED'"
```

## Incident Response

### Provider Failure

1. Check provider health: `curl https://api.thannow.com/api/providers/health`
2. Check provider metrics in logs
3. If provider is down, the router will automatically fall back to the secondary provider
4. If all providers are down, items will fail and be marked as FAILED in the database
5. Notify engineering team if failure rate exceeds 5%

### Queue Backlog

1. Check queue length: `redis-cli LLEN restoration_queue`
2. If > 100 items, check worker count
3. Scale workers if needed: `gcloud run services update worker --set-env-vars=WORKER_COUNT=10`
4. Monitor processing rate

### Billing Issues

1. Check OpenAI: https://platform.openai.com/usage
2. Check fal.ai: https://fal.ai/dashboard/billing
3. Check Replicate: https://replicate.com/account/billing
4. If balance exhausted, add funds and notify team

## Common Tasks

### Restart Worker

```bash
gcloud run services restart restoration-worker --region=us-central1
```

### Update Provider Configuration

1. Edit `ProviderPolicyEngine.DEFAULT_POLICY_CONFIG` in `src/restoration-providers/policy/ProviderPolicyEngine.ts`
2. Deploy: `npm run deploy:api`
3. Verify: `curl https://api.thannow.com/api/providers/health`

### Add New Provider

1. Implement `IRestorationProvider` interface
2. Add to `ProviderFactory.create()` switch statement
3. Add to `ProviderPolicyEngine` package policies
4. Register in `restoration.service.ts`
5. Run tests
6. Deploy

### Clear Stuck Items

```bash
# Find items stuck in PROCESSING for > 5 minutes
psql $DATABASE_URL -c "
  UPDATE restoration_item 
  SET status = 'FAILED', error_message = 'Timeout - manually cleared'
  WHERE status = 'PROCESSING' 
  AND updated_at < NOW() - INTERVAL '5 minutes'
"
```

### View Logs

```bash
# API logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=api" --limit=50

# Worker logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=restoration-worker" --limit=50
```

## Troubleshooting

### "Primary provider not found"

- Check `ProviderFactory.create()` switch statement includes the provider name
- Verify provider name matches `ProviderPolicyEngine` policy configuration

### "Provider X failed after N attempts"

- Check provider credentials (API keys)
- Check provider account balance
- Check network connectivity from Cloud Run to provider API

### "Restore service is not configured" (RunPod)

- Verify `RESTORATION_ENDPOINT_URL` environment variable is set
- Verify RunPod worker is running and accessible

### Image download fails

- Check R2 bucket permissions
- Verify signed URL generation is working
- Check Cloudflare R2 CORS configuration

## Emergency Contacts

| Service | Contact |
|---|---|
| OpenAI Billing | https://platform.openai.com/settings/organization/billing |
| fal.ai Billing | https://fal.ai/dashboard/billing |
| Replicate Billing | https://replicate.com/account/billing |
| RunPod | https://dashboard.runpod.io |
| Cloudflare | https://dash.cloudflare.com |
| GCP | https://console.cloud.google.com |
