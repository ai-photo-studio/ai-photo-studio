# Performance Report — OPS-131

**Date:** 2026-07-24

## Part F — Production Performance

### API Latency (from Pakistan)

| Endpoint | TTFB | Total Time | Status |
|----------|------|------------|--------|
| `GET /api/health` | 715ms | 715ms | 200 |
| `GET /api/packages` | 968ms | 1,268ms | 200 |
| `GET / (frontend)` | 906ms | 906ms | 200 |

### Bundle Size (Post-Build)

| Asset | Size | Gzipped |
|-------|------|---------|
| `index.html` | 0.43 KB | 0.29 KB |
| `index-BGS86QPF.js` | 247.72 KB | 73.79 KB |
| `index-Xv1uWqrF.css` | 24.99 KB | 5.74 KB |
| **Total** | **273.14 KB** | **79.82 KB** |

### Performance Breakdown

```
API /api/packages:
  DNS Lookup:     20ms
  TCP Connect:    268ms  
  TLS Handshake:  190ms
  TTFB:           968ms (includes ~480ms connection + ~488ms server processing)
  Download:       300ms
  Total:          1,268ms
```

### ERR_CONNECTION_CLOSED Analysis

**Likely causes for `ERR_CONNECTION_CLOSED` on homepage:**

| Cause | Likelihood | Evidence |
|-------|-----------|----------|
| Cloudflare idle connection timeout | **HIGH** | Cloudflare free plan has 100s idle timeout; long-TTFB requests may trigger early closure |
| Cold start | **MEDIUM** | Cloud Run has `min-instances=1`, so at least 1 instance is always warm. Cold start would add ~2-3s on first request after scale-to-zero |
| Browser cache | **LOW** | Cache would reduce latency, not cause connection errors |
| Network timeout | **LOW** | Latency is ~900ms, well under typical browser timeouts (30s+) |
| Cloud Run instance recycling | **MEDIUM** | Cloud Run may recycle instances; during recycling, a request could see connection reset |

**Most likely:** Cloudflare proxy (orange cloud) timeout + Cloud Run's 512Mi memory limit causing occasional OOM kills, leading to connection resets.

### Recommendations

1. Verify Cloudflare proxy mode for `api.thannow.com` — should be DNS-only (grey cloud) per prior constraint
2. Monitor Cloud Run memory usage — 512Mi might be tight for Express + Prisma
3. Consider Cloudflare caching for `/api/packages` (cache TTL 60s) since it's read-only, public data

### Classification

**Performance: UNKNOWN** — Latency is acceptable (~1s TTFB) for a cross-region API. Bundle size is reasonable (248KB JS, 25KB CSS). `ERR_CONNECTION_CLOSED` requires Cloudflare proxy mode verification to diagnose definitively.
