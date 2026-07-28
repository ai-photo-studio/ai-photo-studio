# OPS-130 — Production Routing Report

**Date:** 2026-07-24

## Frontend Routing

```
Browser → https://thannow.com / www.thannow.com
  → Cloudflare DNS (proxied, orange cloud)
  → Cloudflare Pages (ai-photo-studio-frontend)
  → Static SPA (index-BR7fkVl4.js)
```

**Verified:** Cloudflare Pages serves 100% of frontend traffic.

## API Routing

```
Browser → https://api.thannow.com
  → Cloudflare DNS (grey cloud, DNS-only)
  → CNAME: ghs.googlehosted.com
  → Google Cloud Load Balancer
  → Cloud Run: ai-photo-studio-api (revision 00096-gkh)
```

**Verified:** Google Cloud Run serves 100% of API traffic.

## Infrastructure References

### Cloud Run References

| Location | Reference | Status |
|----------|-----------|--------|
| DNS `api.thannow.com` | CNAME → `ghs.googlehosted.com` → Cloud Run | ✅ CURRENT |
| `gcloud run services list` | `ai-photo-studio-api` | ✅ ACTIVE |
| Response headers | `Server: Google Frontend` | ✅ VERIFIED |
| Response headers | `x-cloud-trace-context` | ✅ VERIFIED (GCP-only) |
| GitHub Actions deploy.yml | Comment mentions "Northflank" only | ❌ NOT Cloud Run |
| Dockerfile | Build produces image for any target | ⚠️ AMBIGUOUS |

### Northflank References

| Location | Reference | Status |
|----------|-----------|--------|
| `northflank.json` | Full Northflank service config | ❌ NEVER USED |
| GitHub Actions deploy.yml line 113-127 | `Trigger Northflank Deploy` (stub) | ❌ STUB ONLY |
| `northflank.app` DNS | Does not resolve | ❌ FAILED |

### Other References

| Location | Reference | Status |
|----------|-----------|--------|
| `.env.project.example` | Northflank env template | ⚠️ ASPIRATIONAL |
| Wrangler config | Points to Cloudflare Pages only | ✅ CORRECT |
| Cloudflare DNS dashboard | `api.thannow.com` grey cloud | ✅ CURRENT |

## One Production Backend Confirmation

| Question | Answer | Evidence |
|----------|--------|----------|
| Is there ONE production backend? | **YES** | Cloud Run revision `00096-gkh` |
| Does Northflank receive traffic? | **NO** | DNS doesn't resolve |
| Does any other platform receive API traffic? | **NO** | Response headers prove Google Frontend only |
| Is the infra configuration misleading? | **YES** | `northflank.json` describes aspirational config; actual production is on Cloud Run |

## Recommended Corrective Action

1. Update `northflank.json` status to reflect current architecture (Cloud Run), or
2. Complete the Northflank migration properly:
   - Point DNS to Northflank
   - Configure Northflank webhook
   - Verify DNS propagation
3. Until migration is complete, deploy all fixes to Cloud Run (the actual production platform)
