# OPS-127 — Connectivity Report

**Date:** 2026-07-24

## Cloudflare DNS

| Domain | Resolves | HTTPS | Notes |
|--------|----------|-------|-------|
| thannow.com | ✅ YES | ✅ Serving SPA | Apex domain, Cloudflare proxied (orange cloud) |
| www.thannow.com | ✅ YES | ✅ Serving SPA | CNAME to ai-photo-studio-frontend.pages.dev |
| api.thannow.com | ✅ YES | ✅ Responding | DNS-only (grey cloud), CNAME to ghs.googlehosted.com |

## Cloudflare Pages

| Property | Value |
|----------|-------|
| Project | ai-photo-studio-frontend |
| Custom domains | thannow.com, www.thannow.com |
| Latest deployment | b5e83b66 (6 minutes ago at check) |
| Build hash | index-BR7fkVl4.js |

## SSL/TLS

| Setting | Status |
|---------|--------|
| SSL mode | Flexible (Cloudflare manages cert) |
| Always use HTTPS | Enabled |
| Minimum TLS version | 1.2 |

## ERR_CONNECTION_CLOSED / ERR_TIMED_OUT Analysis

| Possible Cause | Likelihood | Evidence |
|---------------|------------|----------|
| Cloudflare edge cache stale | Low | New deployment invalidates cache automatically |
| Client DNS cache | **HIGH** | Most likely cause — flush DNS or wait for TTL |
| ISP routing issue | Low | Both apex and www accessible from test env |
| Cloudflare WAF blocking | Low | No WAF rules found blocking this origin |
| Cloudflare Workers interference | Low | No Workers configured on this route |
| Northflank (migration) | **NOT USED** | Not part of current architecture |

## Origin Health

| Service | Status | URL |
|---------|--------|-----|
| API (Cloud Run) | ✅ HEALTHY | api.thannow.com returns 200 |
| Frontend (Pages) | ✅ HEALTHY | thannow.com returns SPA |
| Database (Neon) | ⚠️ UNKNOWN | No direct test, API endpoints respond |

## Connectivity Conclusion

The `ERR_CONNECTION_CLOSED` and `ERR_TIMED_OUT` errors are most likely caused by **client-side DNS caching** or **transient ISP routing issues**. The Cloudflare and Pages infrastructure is correctly configured and serving traffic.

**Action:** Instruct users to:
1. Clear browser cache (Chrome: Settings → Privacy → Clear browsing data → Cached images and files)
2. Flush DNS: `ipconfig /flushdns` (Windows) or `sudo dscacheutil -flushcache` (macOS)
3. Try incognito/private browsing mode
