# Cloudflare Health — OPS-133

**Date:** 2026-07-24

## Frontend: `www.thannow.com`

| Property | Value |
|----------|-------|
| Proxy mode | **PROXIED** (orange cloud) |
| Server header | `cloudflare` |
| SSL/TLS | ✅ HTTPS (h3 available via alt-svc) |
| Always HTTPS | ✅ (redirect HTTP→HTTPS) |
| HTTP/2 | ✅ |
| HTTP/3 | ✅ (via `alt-svc: h3=":443"; ma=86400`) |
| Cache status | `DYNAMIC` |
| Cache-Control | `public, max-age=0, must-revalidate` |
| CF-RAY | `a20378c1ade2b698-MRS` (Karachi edge?) |
| NEL | Configured |

## API: `api.thannow.com`

| Property | Value |
|----------|-------|
| Proxy mode | **DNS-ONLY** (grey cloud per project constraint) |
| Server header | `Google Frontend` (NOT cloudflare) |
| Edge caching | None (traffic goes directly to Google Cloud Run) |
| SSL/TLS | ✅ Cloudflare DNS points to `ghs.googlehosted.com` (Google) |

## Potential Issues

1. **Frontend is proxied** (orange cloud): Cloudflare may terminate idle connections after 100s. Combined with `max-age=0, must-revalidate`, every page load goes to origin.
2. **API is NOT proxied**: No Cloudflare edge protection or caching on API. All traffic hits Cloud Run directly.
3. **No custom routes**: No `_routes.json` or `routes.json` in the Pages project — the `_redirects` file only does SPA fallback.

## Classification

**Cloudflare: VERIFIED** — SSL/TLS, HTTP/3, HTTPS all working. No configuration changes needed.
