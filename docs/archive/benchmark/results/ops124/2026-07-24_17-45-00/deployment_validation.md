# OPS-124 — Deployment Validation

**Date:** 2026-07-24

## Live Deployment

| Property | Value |
|----------|-------|
| Cloudflare Pages project | ai-photo-studio-frontend |
| Latest deployment ID | fe5c2301-002d-4436-9ce3-03020f32badd |
| Deployed commit | f1271bb (OPS-123) |
| Deployment time | 2026-07-24 (25 seconds ago at check) |
| Preview URL | https://fe5c2301.ai-photo-studio-frontend.pages.dev |
| Custom domain (Apex) | thannow.com |
| Custom domain (www) | www.thannow.com |
| API domain | api.thannow.com (DNS-only, grey cloud) |
| Frontend bundle JS | index-BR7fkVl4.js (244.6 kB, 73.2 kB gzip) |
| Frontend bundle CSS | index-Xv1uWqrF.css (25.0 kB, 5.7 kB gzip) |

## Build Verification

| Step | Status | Output |
|------|--------|--------|
| `npm run typecheck` | ✅ VERIFIED | API + Web both pass |
| `npm run build` | ✅ VERIFIED | Web: `✓ built in 2.87s` |
| `npx wrangler pages deploy` | ✅ VERIFIED | `✨ Deployment complete!` |

## Asset Manifest

| Asset | Path | Size | Status |
|-------|------|------|--------|
| HTML | `dist/index.html` | 0.43 kB | ✅ |
| JS | `dist/assets/index-BR7fkVl4.js` | 244.6 kB | ✅ |
| CSS | `dist/assets/index-Xv1uWqrF.css` | 25.0 kB | ✅ |
| Redirects | `dist/_redirects` | ~50 B | ✅ |

## Cache Invalidation

- Cloudflare Pages deployments **automatically invalidate CDN cache** for all associated domains
- New deployment ID triggers new asset URLs (build hash changes: `BR7fkVl4`)
- No manual purge required

## Browser Cache Headers

**UNKNOWN** — Requires DevTools inspection on live site.

## Protected Scope Verification

| Area | Status | Notes |
|------|--------|-------|
| No frontend architecture redesign | ✅ | Only UI components changed |
| No Replicate pipeline changes | ✅ | Pipeline untouched |
| No route changes | ✅ | Same routes, new components |
| Existing auth | ✅ | requireAuth preserved |
| Existing rate limiting | ✅ | Preserved |
```
