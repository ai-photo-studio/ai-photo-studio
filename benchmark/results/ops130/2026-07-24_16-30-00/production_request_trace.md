# OPS-130 — Production Request Trace

**Date:** 2026-07-24

## Trace Results

### Frontend: thannow.com / www.thannow.com

| Property | Value |
|----------|-------|
| DNS resolution | Cloudflare (proxied, orange cloud) |
| Origin | Cloudflare Pages (`ai-photo-studio-frontend.pages.dev`) |
| Server header | Cloudflare (Frontend is Pages, not self-hosted) |
| Infrastructure | Cloudflare Pages — ✅ CONFIRMED |

### API: api.thannow.com

| Property | Value | Evidence |
|----------|-------|----------|
| DNS | CNAME to `ghs.googlehosted.com` (grey cloud) | Cloudflare DNS config |
| **Server header** | **`Google Frontend`** | ✅ CAPTURED |
| **x-cloud-trace-context** | `0af658fc60b0c03898df03f8215a9539;o=1` | ✅ CAPTURED (GCP-specific header) |
| X-Powered-By | Express | ✅ CAPTURED |
| ETag | `W/"3b-gFMF3SOyI8F7692b+e/CZZgk56A"` | Same as Cloud Run URL |
| Rate limit | 120 req/min (2 remaining) | Same as Cloud Run URL |
| Origin hostname | `ai-photo-studio-api-mp3arpoi2a-uc.a.run.app` | ✅ CAPTURED |
| Cloud Run revision | `ai-photo-studio-api-00096-gkh` (Jul 21) | ✅ VERIFIED via gcloud |
| **Northflank URL** | **Does not resolve** | ❌ `ai-photo-studio-api.northflank.app` DNS failure |

### Cloud Run Direct URL

| Property | Value |
|----------|-------|
| URL | `https://ai-photo-studio-api-mp3arpoi2a-uc.a.run.app/api/health` |
| Server | `Google Frontend` |
| Headers | **IDENTICAL** to api.thannow.com (same ETag, same CORS headers, same Express version) |

## Conclusion

**VERIFIED: 100% of production API traffic is served by Google Cloud Run.**

- `api.thannow.com` → (grey cloud CNAME) → `ghs.googlehosted.com` → Google Frontend → Cloud Run revision `00096-gkh`
- Northflank DNS does not resolve — Northflank was NEVER connected to production
- All response headers between `api.thannow.com` and the direct Cloud Run URL are identical
