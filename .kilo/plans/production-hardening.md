# Northflank Production Hardening Plan

## Domain

### Add `api.thannow.com`

1. **Add domain to Northflank account** (Settings → Domains → Add Domain)
   - Domain: `thannow.com`
   - Add TXT record to DNS: `_northflank-challenge.thannow.com` with the verification token
   - Verify in Northflank

2. **Add subdomain** (Domains → `thannow.com` → Add Subdomain)
   - Subdomain: `api`
   - Add CNAME record to DNS: `api.thannow.com` → Northflank-generated target (shown on screen)

3. **Link to service port**
   - Service → Ports → Port 8080 → Link Domain → Select `api.thannow.com`

4. **Update old DNS**
   - `api.thannow.com` currently points to Railway (CNAME: `studioapi-production-f8f2.up.railway.app`)
   - Change CNAME to Northflank target
   - Old Railway domain will stop receiving traffic

## SSL

Northflank auto-provisions Let's Encrypt TLS certificates for custom domains. After linking `api.thannow.com` to the port:

- Certificate provisions automatically (1–5 min)
- Auto-renews before expiry (90-day certs)
- No manual renewal needed
- Status visible in Domains → Subdomain → Certificate Status

## Auto Deploy

### Already configured (from Step 3)

| Setting | Current | Status |
|---------|---------|--------|
| CI (Continuous Integration) | Enabled | ✅ Build on push to `main` |
| CD (Continuous Deployment) | Enabled | ✅ Auto-deploy latest build |
| Branch | `main` | ✅ |
| Dockerfile path | `/Dockerfile` | ✅ |

### No changes needed

## Rollback

Northflank supports deployment rollback through the Dashboard:

1. Go to Combined Service → Deployments tab
2. Select a previous successful deployment
3. Click "Redeploy" to roll back to that specific build

**CLI equivalent:**
```bash
# Redeploy a specific deployment
npx northflank restart service --serviceId "ai-photo-studio" --projectId "ai-photo-studio"

# List deployments to find the one to roll back to
npx northflank list deployments --serviceId "ai-photo-studio" --projectId "ai-photo-studio"
```

**Recommendation:** Enable CD with `restartPolicyMaxRetries: 10` (already set in service config). Keep the last 10 successful builds for rollback purposes.

## CPU/RAM

### Current Resources

The default Northflank free plan provides limited shared CPU and memory. Based on the Dockerfile using `node:24-slim` and the application requiring:
- Express.js API server
- Prisma ORM (PostgreSQL connections)
- Bull queue (Redis connections)
- Replicate API calls

### Recommended Minimum Production Settings

| Resource | Free Tier (Current) | Recommended Production |
|----------|---------------------|----------------------|
| **CPU** | Shared (limited) | **1 dedicated vCPU** |
| **RAM** | 512 MB shared | **2 GB dedicated** |
| **Instances** | 1 | **2** (for HA) |

**Rationale:**
- 2 GB RAM handles Prisma query cache, Bull queue processing, and Express middleware
- 1 vCPU prevents CPU contention during image processing API calls
- 2 instances provide redundancy if one fails (load balancer auto-routes)

**How to update:**
1. Service → Resources → Compute Plan → Select `1 vCPU / 2 GB RAM` (or equivalent)
2. Service → Scale → Instances → Set to `2`

## Logs

### Already available

Northflank provides:
- **Build logs** — Docker build output (step-by-step)
- **Runtime logs** — Container stdout/stderr (already verified using `npx northflank get service logs`)
- **Ingress logs** — HTTP request/response logs
- **CDN logs** — CDN cache logs

### Recommended configuration

| Log Type | Retention | Recommended |
|----------|-----------|-------------|
| Build logs | 30 days (default) | ✅ Sufficient |
| Runtime logs | 7 days (default) | ✅ Sufficient |
| **Log sink** (optional) | External | Configure log sink to external provider (Datadog, Grafana, etc.) if needed |

**Access via CLI:**
```bash
# Runtime logs (last 50 lines)
npx northflank get service logs --projectId "ai-photo-studio" --serviceId "ai-photo-studio" -l 50 --types runtime

# Build logs
npx northflank get service logs --projectId "ai-photo-studio" --serviceId "ai-photo-studio" -l 50 --types build
```

## Metrics

### Already available

Northflank provides real-time metrics:
- **CPU usage** (% of allocated)
- **Memory usage** (MB / GB)
- **Network I/O** (in/out)
- **HTTP request count** (per deployment)

View from: Service → Observe → Metrics

### Recommended setup

No additional configuration required. Metrics are built-in and displayed in the Dashboard.

## Recommended Changes Summary

| Priority | Change | Impact |
|----------|--------|--------|
| **P0** | Add `api.thannow.com` subdomain + update DNS CNAME | Required for production traffic |
| **P0** | Link domain to port 8080 | Required for custom domain to work |
| **P0** | Verify SSL auto-provisions | Required for HTTPS |
| **P1** | Upgrade CPU to 1 vCPU | Prevents CPU contention |
| **P1** | Upgrade RAM to 2 GB | Sufficient for Prisma + Bull + Express |
| **P2** | Scale instances to 2 | Production redundancy |

## Production Ready: CONDITIONAL

✅ Application starts successfully  
✅ Health endpoint returns 200  
✅ All env vars configured in secret group  
✅ Auto Deploy (CI/CD) enabled  
✅ Logs and metrics available  
⚠️ `api.thannow.com` domain not yet configured  
⚠️ CPU/RAM at free-tier minimums (adequate for low traffic, upgrade recommended)

The production domain and resource upgrades should be completed before declaring the environment fully production-ready.

## Next Step

Northflank Step 7 - End-to-End Production Verification
