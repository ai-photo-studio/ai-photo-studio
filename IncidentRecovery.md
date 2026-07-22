# Incident Recovery Guide

**Version:** 1.0  
**Date:** 2026-07-22

---

## Incident Classification

| Severity | Description | Response Time |
|---|---|---|
| SEV-1 | All providers down, no restorations possible | 15 min |
| SEV-2 | Primary provider down, fallback working | 1 hour |
| SEV-3 | Individual image failures, <10% failure rate | 4 hours |
| SEV-4 | Performance degradation, >30s latency | 24 hours |

---

## Common Incidents

### SEV-1: All Providers Down

**Symptoms:**
- All restoration jobs failing
- Provider health checks all returning "down"
- Queue backing up

**Recovery Steps:**
1. Switch to mock provider mode:
   ```bash
   gcloud run services update api --set-env-vars=PROVIDER_MODE=manual
   ```
2. Update policy to use mock for all tiers:
   - Edit `ProviderPolicyEngine.DEFAULT_POLICY_CONFIG`
   - Set all tiers to `primaryProvider: "mock"`
3. Deploy: `npm run deploy:api`
4. Investigate provider outages:
   - Check OpenAI status: https://status.openai.com
   - Check fal.ai status: https://status.fal.ai
   - Check Replicate status: https://status.replicate.com
5. Once providers recover, revert to normal configuration

**Rollback:**
```bash
gcloud run services update api --set-env-vars=PROVIDER_MODE=automatic
```

---

### SEV-2: Primary Provider Down (Fallback Active)

**Symptoms:**
- Premium/print tier jobs slow or failing
- Primary provider (OpenAI) returning errors
- Fallback provider (fal.ai) handling requests

**Recovery Steps:**
1. Check primary provider health and billing
2. Monitor fallback provider costs (may be higher)
3. If primary is permanently down, update policy to use fallback as primary:
   - Edit `ProviderPolicyEngine.DEFAULT_POLICY_CONFIG`
   - Swap `primaryProvider` and `fallbackProvider` for affected tiers
4. Deploy changes

---

### SEV-2: RunPod Worker Unavailable

**Symptoms:**
- Preview/basic/archive tier jobs failing
- Error: "restore service is not configured"
- RunPod health check returning "down"

**Recovery Steps:**
1. Check RunPod worker status:
   ```bash
   curl $RESTORATION_ENDPOINT_URL/health
   ```
2. If worker is down, restart it:
   ```bash
   # Via RunPod dashboard or API
   ```
3. If endpoint URL is wrong, update environment variable:
   ```bash
   gcloud run services update api --set-env-vars=RESTORATION_ENDPOINT_URL=https://...
   ```
4. For preview/basic tier, temporarily route to commercial providers as fallback

---

### SEV-3: High Failure Rate

**Symptoms:**
- >10% of restoration jobs failing
- Mixed success/failure across providers
- Some images processing successfully

**Recovery Steps:**
1. Check error logs for specific failure patterns
2. Identify affected provider(s)
3. If specific provider failing, temporarily disable it:
   - Remove from `ProviderFactory`
   - Update `ProviderPolicyEngine` to not use it
4. Check for image-specific issues (size, format, content)
5. Review Quality Lab metrics for degradation

---

### SEV-3: Billing Limit Reached

**Symptoms:**
- Provider returns 402/403 errors
- Error messages mention "billing" or "quota"
- All requests to affected provider fail

**Recovery Steps:**
1. Identify affected provider from error logs
2. Add funds to provider account:
   - OpenAI: https://platform.openai.com/settings/organization/billing
   - fal.ai: https://fal.ai/dashboard/billing
   - Replicate: https://replicate.com/account/billing
3. Verify recovery with health check
4. Monitor costs to prevent recurrence

---

### SEV-4: Performance Degradation

**Symptoms:**
- Average processing time > 30 seconds
- Queue growing faster than processing
- Provider latency > 10 seconds

**Recovery Steps:**
1. Check provider latency via health checks
2. Check queue length: `redis-cli LLEN restoration_queue`
3. Scale workers if queue > 100 items
4. Check for rate limiting (HTTP 429 responses)
5. If RunPod cold starts are slow, pre-warm workers

---

## Data Recovery

### Recover Failed Restoration Items

```sql
-- Find failed items in the last 24 hours
SELECT id, order_id, error_message, created_at
FROM restoration_item
WHERE status = 'FAILED'
AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### Re-process Failed Item

```sql
-- Reset item status to allow reprocessing
UPDATE restoration_item
SET status = 'PENDING',
    error_message = NULL,
    processing_stage = 'RESTORATION_ANALYSIS'
WHERE id = '<item_id>';
```

### Restore Deleted Images

Images are stored in R2 with versioning enabled. To recover:

```bash
# List object versions
rclone listversions s3:bucket-name/path/to/object

# Restore previous version
r2 object copy --version-id <version_id> s3:bucket-name/path/to/object
```

---

## Communication

### Internal

| Channel | Purpose |
|---|---|
| #engineering-alerts | SEV-1 and SEV-2 incidents |
| #ops | SEV-3 and SEV-4 incidents |
| #provider-status | Provider outages and billing issues |

### External

| Audience | Channel | Template |
|---|---|---|
| Customers (SEV-1) | Status page | "We are experiencing service degradation. Our team is working on it." |
| Customers (SEV-2) | Status page | "Some requests may be slower than usual. No data loss." |
| Enterprise customers | Direct email | Personalized communication for paid accounts |

---

## Post-Incident

1. Create incident report within 24 hours
2. Identify root cause
3. Implement preventive measures
4. Update this runbook with lessons learned
5. Schedule post-mortem meeting if SEV-1 or SEV-2
