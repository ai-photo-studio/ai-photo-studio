# Provider Operations Guide

**Version:** 1.0  
**Date:** 2026-07-22

---

## Provider Overview

| Provider | Type | Tier | Cost/Image | SLA | Notes |
|---|---|---|---|---|---|
| RunPod | Self-hosted | Preview, Basic, Archive | ~$0.003-0.015 | 99% | Own models, cold starts |
| OpenAI DALL-E 3 | Commercial | Premium, Print | $0.04 | 99.9 | Billing limit risk |
| fal.ai | Commercial | Premium (fallback) | $0.04 | 99% | Balance exhaustion risk |
| Replicate CodeFormer | Commercial | Face restoration | ~$0.0037 | 99% | Face-only, cheap |

---

## Provider Registration & Configuration

### OpenAI (DALL-E 3)

**API Key:** `OPENAI_API_KEY` environment variable  
**Endpoint:** `POST https://api.openai.com/v1/images/edits`  
**Model:** `dall-e-3`  
**Authentication:** `Authorization: Bearer <key>`  

**Health Check:**
```bash
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
  https://api.openai.com/v1/models
```

**Billing Management:**
- Dashboard: https://platform.openai.com/settings/organization/billing
- Set spending limits to prevent unexpected charges
- Monitor usage: https://platform.openai.com/usage

**Common Issues:**
- Billing hard limit: Add payment method in OpenAI dashboard
- Rate limiting: 2000 RPM (Tier 5), implement retry with backoff
- Model not found: Ensure using `dall-e-3` not `gpt-image-1`

### fal.ai (Photo Restoration)

**API Key:** `FAL_AI_API_KEY` environment variable  
**Endpoint:** `POST https://fal.run/fal-ai/image-editing/photo-restoration`  
**Authentication:** `Authorization: Key <key>`  

**Health Check:**
```bash
curl -H "Authorization: Key $FAL_AI_API_KEY" \
  https://api.fal.ai/v1/models
```

**Billing Management:**
- Dashboard: https://fal.ai/dashboard/billing
- Add credits: https://fal.ai/dashboard/billing/top-up
- Monitor usage: https://fal.ai/dashboard/usage

**Common Issues:**
- Account locked (balance exhausted): Top up at dashboard
- 404 endpoint not found: Verify endpoint name `fal-ai/image-editing/photo-restoration`
- Image too large: Max 10 MB input

### Replicate (CodeFormer)

**API Token:** `REPLICATE_API_TOKEN` environment variable  
**Endpoint:** `POST https://api.replicate.com/v1/models/sczhou/codeformer/predictions`  
**Authentication:** `Authorization: Bearer <token>`  

**Health Check:**
```bash
curl -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
  https://api.replicate.com/v1/models
```

**Billing Management:**
- Dashboard: https://replicate.com/account/billing
- Add credits: https://replicate.com/account/billing
- Monitor usage: https://replicate.com/account/billing

**Common Issues:**
- 404 model not found: Use `sczhou/codeformer` (official), not `tencentarc/gfpgan`
- Prediction timeout: Default 60s sync, then async polling
- Input image too large: Max 256 KB for data URIs, use URL for larger

### RunPod (Self-Hosted)

**API Key:** `RUNPOD_API_KEY` environment variable  
**Endpoint:** `RESTORATION_ENDPOINT_URL` environment variable  
**Authentication:** API key in request header  

**Health Check:**
```bash
curl $RESTORATION_ENDPOINT_URL/health
```

**Common Issues:**
- Cold starts: 2-5 minutes for serverless GPU
- Worker not running: Check RunPod dashboard
- Endpoint URL not set: Configure `RESTORATION_ENDPOINT_URL` env var

---

## Provider Routing Policy

| Package Tier | Primary | Fallback | Cost Cap | Quality Target |
|---|---|---|---|---|
| Preview | RunPod | None | $0.005 | 40 |
| Basic | RunPod | None | $0.010 | 50 |
| Premium | OpenAI | fal.ai | $0.050 | 85 |
| Print | OpenAI | fal.ai | $0.100 | 90 |
| Archive | RunPod | None | $0.010 | 50 |

---

## Monitoring & Alerting

### Health Checks

The API performs health checks on all registered providers:
- OpenAI: `GET /v1/models` (5s timeout)
- fal.ai: `GET https://api.fal.ai/v1/models` (5s timeout)
- Replicate: `GET /v1/models` (5s timeout)
- RunPod: Custom `/health` endpoint (5s timeout)

### Metrics

Provider metrics are collected via `ProviderMetricsCollector`:
- Total requests
- Successful requests
- Failed requests
- Total latency
- Total cost

### Alerting Thresholds

| Metric | Warning | Critical |
|---|---|---|
| Provider error rate | >5% | >20% |
| Provider latency | >10s | >30s |
| Queue length | >50 | >200 |
| Failed items (24h) | >10 | >50 |

---

## Cost Management

### Daily Cost Estimation

| Tier | Avg Images/Day | Cost/Image | Daily Cost |
|---|---|---|---|
| Preview (RunPod) | 100 | $0.005 | $0.50 |
| Basic (RunPod) | 50 | $0.010 | $0.50 |
| Premium (OpenAI) | 20 | $0.04 | $0.80 |
| Print (OpenAI) | 5 | $0.04 | $0.20 |

**Estimated daily total:** ~$2.00

### Cost Optimization

1. **Preview/Basic:** Always use RunPod (cheapest)
2. **Premium/Print:** OpenAI primary, fal.ai fallback (same cost, different quality)
3. **Face-only images:** Consider Replicate CodeFormer (~$0.0037 vs $0.04)
4. **Monitor billing:** Set alerts at 50%, 80%, 100% of monthly budget

---

## Provider Failover

When the primary provider fails:

1. Router retries primary up to `maxRetries` (default: 2)
2. If all retries fail, router attempts fallback provider
3. If fallback also fails, job is marked as FAILED
4. Error is logged with provider name and error details
5. Metrics are updated for both providers

**Failover cooldown:** 30 seconds (prevents rapid flip-flopping)

---

## Maintenance Windows

| Provider | Maintenance Window | Notes |
|---|---|---|
| OpenAI | No scheduled maintenance | Check status.openai.com |
| fal.ai | No scheduled maintenance | Check status.fal.ai |
| Replicate | Tuesdays 2-4 AM PT | Check status.replicate.com |
| RunPod | No scheduled maintenance | Check status.runpod.io |

Schedule maintenance during low-traffic hours (typically 2-4 AM local time).
