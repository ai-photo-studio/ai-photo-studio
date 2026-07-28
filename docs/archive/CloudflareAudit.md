# Cloudflare Audit

## Pages Project
```
Name: ai-photo-studio-frontend
Domains: ai-photo-studio-frontend.pages.dev, thannow.com, www.thannow.com
```

## Production Deployments

| Deployment ID | Commit | Age | Bundle Hash |
|--------------|--------|-----|-------------|
| `cf7808b1` | `2d4ac85` (OPS-142) | 15 min | `index-BxGXJtiD.js` ✅ |
| `26625e6b` | `204a926` (OPS-129) | 22 hr | `index-BGS86QPF.js` ❌ Stale |
| `855ba961` | `d48de21` (OPS-127) | 23 hr | — |

## Custom Domain Verification

| Custom Domain | Pages Binding | HTTP Status | Notes |
|--------------|--------------|-------------|-------|
| `thannow.com` | ✅ Bound | 200 | Apex domain, formerly had no backend (HTTP 522) |
| `www.thannow.com` | ✅ Bound | 200 | Primary production domain |
| `ai-photo-studio-frontend.pages.dev` | N/A (default) | 200 | Cloudflare default domain |

## SSL Configuration

- **SSL Mode:** Full (strict) — requires valid certificate on origin
- **Universal SSL:** Active for `thannow.com` and `www.thannow.com`
- **Edge Certificate:** Cloudflare-issued
- **Minimum TLS Version:** Not explicitly restricted
- **Always HTTPS:** Enabled
- **Automatic HTTPS Rewrites:** Enabled (default)

## Edge Response Analysis

Both `thannow.com` and `www.thannow.com` respond from Cloudflare edge with:
- `Server: cloudflare`
- `cf-cache-status: DYNAMIC`
- HTTP/3 available (`alt-svc: h3=":443"; ma=86400`)
- TLS 1.3 established

## No Blocking Rules Detected

The following Cloudflare features were verified as NOT causing connection closure:
- ✅ No Workers
- ✅ No Redirect Rules
- ✅ No Transform Rules
- ✅ No WAF Rules blocking
- ✅ No Page Rules
- ✅ No Cache Rules
- ✅ No Access Rules

## Historical Issue

The ERR_CONNECTION_CLOSED was caused by **thannow.com apex having no Pages backend configured**. The domain resolved to Cloudflare IPs (orange cloud) but Cloudflare had no upstream Pages origin for the apex domain, resulting in HTTP 522 (origin connection failure) → ERR_CONNECTION_CLOSED. The `www.thannow.com` subdomain worked because it was correctly bound to the Pages project.

## Resolution

Both `thannow.com` and `www.thannow.com` are now bound to the Cloudflare Pages project `ai-photo-studio-frontend`, returning HTTP 200 with the correct frontend bundle.
