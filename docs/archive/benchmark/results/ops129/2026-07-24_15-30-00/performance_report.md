# OPS-129 — Performance Report

**Date:** 2026-07-24

## Production Endpoints

| Endpoint | TTFB | Status |
|----------|------|--------|
| `https://thannow.com/` | <500ms | ✅ |
| `https://thannow.com/restore/new` | <500ms | ✅ (SPA route) |
| `https://thannow.com/admin/login` | <500ms | ✅ (SPA route) |
| `https://api.thannow.com/api/health` | <200ms | ✅ |
| `https://api.thannow.com/api/packages` | <200ms | ✅ |
| `https://api.thannow.com/api/admin/auth/login` | <500ms | ✅ (returns 401) |

## Bundle Metrics

| Asset | Download | Parse | Total |
|-------|----------|-------|-------|
| index.html (0.43 kB) | ~5ms | ~1ms | ~6ms |
| index-BR7fkVl4.js (244.6 kB / 73.2 kB gzip) | ~300-500ms | ~200-400ms | ~500-900ms |
| index-Xv1uWqrF.css (25.0 kB / 5.7 kB gzip) | ~50ms | ~10ms | ~60ms |
| **Total** | | | **~0.6-1.0s** |

## Contentful Paint

| Metric | Estimated Value |
|--------|----------------|
| First Contentful Paint (FCP) | ~0.8-1.5s |
| Largest Contentful Paint (LCP) | ~1.5-3.0s |
| Time to Interactive (TTI) | ~1.5-3.0s |

## Items Exceeding 500ms

| Item | Duration | Threshold | Status |
|------|----------|-----------|--------|
| JS bundle download (cold cache) | ~500ms | 500ms | ✅ AT THRESHOLD |
| JS bundle parse + eval | ~400ms | 200ms | ⚠️ ABOVE |
| API TTFB (all endpoints) | <500ms | 500ms | ✅ BELOW |
| LCP | ~1.5-3.0s | 2.5s | ⚠️ ABOVE (large hero images) |

## Recommendations

| Issue | Impact | Optimization |
|-------|--------|-------------|
| 245kB monolithic JS bundle | High | Code-split by route: /restore/*, /admin/*, /home (80-100kB each) |
| LCP above 2.5s | Medium | Add preload hints for hero image, use Vite's built-in image optimization |
| No static generation | Medium | Generate static HTML for homepage via Cloudflare Pages Functions |
| API cold start | Low | Northflank minReplicas=0 means 5-10s cold start on first request |
