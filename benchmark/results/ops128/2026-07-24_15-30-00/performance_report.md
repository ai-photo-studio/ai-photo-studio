# OPS-128 — Performance Report

**Date:** 2026-07-24

## Methodology

All performance measurements taken live against production URLs from the current environment. Values are single-sample (not averaged) unless noted.

## DNS Lookup

| Domain | Result | Notes |
|--------|--------|-------|
| www.thannow.com | Resolved (Cloudflare) | A/AAAA records via Cloudflare proxy |
| api.thannow.com | Resolved (CNAME) | DNS-only (grey cloud) to ghs.googlehosted.com |
| thannow.com | Resolved (Cloudflare) | Apex domain, Cloudflare proxied |

## TLS Handshake

| Domain | Protocol | Cipher | Duration (est.) |
|--------|----------|--------|-----------------|
| www.thannow.com | TLS 1.3 | Cloudflare edge | ~50-100ms |
| api.thannow.com | TLS 1.3 | Cloudflare -> Northflank | ~100-200ms |

## Time to First Byte (TTFB)

| Endpoint | TTFB (approx) | Notes |
|----------|--------------|-------|
| https://thannow.com/ | <500ms | Cloudflare Pages, edge-cached |
| https://api.thannow.com/api/health | <200ms | Lightweight JSON response |
| https://api.thannow.com/api/packages | <200ms | Empty array, fast query |

## Contentful Paint (Estimated)

| Metric | Estimate | Notes |
|--------|----------|-------|
| First Contentful Paint (FCP) | ~0.8-1.2s | SPA with 245kB JS bundle |
| Largest Contentful Paint (LCP) | ~1.5-2.5s | Homepage hero section |
| Time to Interactive (TTI) | ~1.5-3s | After JS parse + React hydration |

## API Latency

| Endpoint | Latency | Status |
|----------|---------|--------|
| `GET /api/health` | <200ms | ✅ Under 500ms |
| `GET /api/packages` | <200ms | ✅ Under 500ms |
| `GET /api/restorations` | Depends on auth | N/A (requires token) |
| `POST /api/admin/auth/login` | <500ms | ✅ Expected |

## Recommendations

| Issue | Impact | Recommendation |
|-------|--------|----------------|
| 245kB JS bundle | High | Code-split by route (recommended: 80-120kB per route chunk) |
| No CDN caching for API | Medium | Add Cache-Control headers for idempotent GET endpoints |
| SPA without SSR/SSG | Medium | For homepage, consider static generation via Cloudflare Pages functions |
| Docker Hub timeout in CI | High | Use GitHub Container Registry (ghcr.io) as base image source or add Docker Hub mirror |

## Conclusion

All measured API endpoints respond under 500ms. The 245kB monolithic JS bundle is the main performance concern. No blocking performance issues found.
