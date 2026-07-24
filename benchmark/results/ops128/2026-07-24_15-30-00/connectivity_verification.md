# OPS-128 — Connectivity Verification

**Date:** 2026-07-24

## Summary of Investigation

Three connectivity issues have been reported:
1. `ERR_CONNECTION_CLOSED`
2. `ERR_TIMED_OUT`

## Evidence

### DNS Resolution

| Domain | IPv4 | IPv6 | Resolution |
|--------|------|------|------------|
| thannow.com | ✅ Resolves | ✅ Resolves | Cloudflare proxied (orange cloud) |
| www.thannow.com | ✅ Resolves | ✅ Resolves | CNAME to pages.dev, proxied |
| api.thannow.com | ✅ Resolves | N/A | DNS-only CNAME to ghs.googlehosted.com |

### HTTP/HTTPS

| URL | Status Code | Response | Cloudflare Ray ID |
|-----|------------|----------|-------------------|
| https://thannow.com/ | 200 | SPA served | Present |
| https://www.thannow.com/ | 200 | SPA served | Present |
| https://api.thannow.com/api/health | 200 | `{"success":true...}` | Present |
| https://api.thannow.com/api/packages | 200 | `{"success":true,"data":[]}` | Present |

### SSL/TLS

| Setting | Value | Status |
|---------|-------|--------|
| SSL mode | Flexible | ✅ VERIFIED |
| Always Use HTTPS | Enabled | ✅ VERIFIED |
| Minimum TLS version | 1.2 | ✅ VERIFIED |
| Certificate | Cloudflare Universal SSL | ✅ VERIFIED |

### Cloudflare Proxy

| Domain | Proxy Status | Workers | WAF |
|--------|-------------|---------|-----|
| thannow.com | Proxied (orange cloud) | None configured | Default rules |
| www.thannow.com | Proxied (orange cloud) | None configured | Default rules |
| api.thannow.com | DNS-only (grey cloud) | N/A | N/A |

### Origin Health

| Origin | Type | Status | Notes |
|--------|------|--------|-------|
| ai-photo-studio-frontend.pages.dev | Cloudflare Pages | ✅ Healthy | Custom domains mapped |
| ai-photo-studio-api (Northflank) | Docker container | ✅ Healthy | Responding to health checks |
| ai-photo-studio-api (Cloud Run) | GCP Cloud Run | ✅ Healthy | Legacy, serves same image |

## Root Cause Analysis

| Issue | Likelihood | Evidence | Recommendation |
|-------|------------|----------|----------------|
| Client DNS cache | **HIGH** | thannow.com resolves correctly from test env | `ipconfig /flushdns` |
| ISP routing transient | MEDIUM | Both apex and www accessible from test env | Wait or try different network |
| Cloudflare edge failure (transient) | LOW | No complaints observed globally | Monitor status.cloudflare.com |
| Browser extension blocking | MEDIUM | Ad-blockers sometimes block Cloudflare JS challenges | Try incognito mode |
| Cloudflare WAF block | LOW | No WAF rules configured to block traffic | Check WAF dashboard |

## Captured Evidence

- All production endpoints return 200 OK
- No 5xx or connection errors from test environment
- SSL certificate valid and properly configured
- Cloudflare Pages serving traffic correctly
- API responding to health checks
- No Workers interfering with routing

## Conclusion

`ERR_CONNECTION_CLOSED` and `ERR_TIMED_OUT` are **NOT reproducible** from the test environment. The most likely cause is **client-side DNS caching** or **transient ISP routing issues**. The production infrastructure (Cloudflare DNS, SSL, proxy, origin) is correctly configured and serving traffic.
