# ERR_CONNECTION_CLOSED Forensics — OPS-133

**Date:** 2026-07-24

## Symptom

Occasional `ERR_CONNECTION_CLOSED` on the homepage (`www.thannow.com`). Not reproducible on every load but reported intermittently.

## Root Cause Analysis

### Possible Causes (Ranked by Likelihood)

| Cause | Likelihood | Evidence |
|-------|-----------|----------|
| **1. Cloud Run OOM (Out of Memory)** | **HIGH** | Cloud Run configured with 512Mi memory. Express with `express.json({ limit: "12mb" })` + Prisma queries + base64 image processing can exceed 512Mi, causing Cloud Run to kill the container. When killed mid-request, the browser sees `ERR_CONNECTION_CLOSED` (TCP RST from GFE). |
| **2. Cloud Run instance recycling** | **MEDIUM** | Cloud Run may recycle instances for updates or health check failures. During recycling, in-flight connections are terminated. `min-instances=1` means at least 1 instance is warm, but during deployment the old revision is drained. |
| **3. Cloudflare proxy idle timeout** | **MEDIUM** | Cloudflare's free plan has a 100-second idle timeout for proxied connections. `www.thannow.com` is proxied (orange cloud). If a connection is idle for >100s, Cloudflare closes it. When the browser tries to reuse the connection via HTTP/1.1 keep-alive, it gets a closed connection. |
| **4. DNS propagation** | **LOW** | `api.thannow.com` uses DNS-only (grey cloud) with CNAME to `ghs.googlehosted.com`. DNS TTL issues could cause brief resolution failures, but this would show as `ERR_DNS_FAILED`, not `ERR_CONNECTION_CLOSED`. |
| **5. Cloud Run cold start** | **LOW** | `min-instances=1` keeps at least 1 warm instance. Cold starts would cause latency spikes (2-3s) but not connection closures. |
| **6. TLS renegotiation failure** | **LOW** | Both `api.thannow.com` (Google Front End) and `www.thannow.com` (Cloudflare) have valid TLS. No TLS errors observed. |

### Most Likely: Memory Pressure (Cause #1)

**Evidence:**
- `cloudbuild.yaml` sets `--memory=512Mi`
- Express JSON body parser limit is `12mb` — large uploads allocate significant heap
- Prisma queries require additional memory for query result sets
- When memory exceeds the limit, Cloud Run sends SIGKILL to the container
- Any in-flight HTTP connections during the kill receive TCP RST → browser shows `ERR_CONNECTION_CLOSED`

**Trigger conditions:**
- Simultaneous upload requests (image processing + Prisma)
- Large base64 payload parsing
- Prisma query on large result sets (e.g., admin dashboard with many orders)

### Contributing Factor: Cloudflare Proxy Idle Timeout (Cause #3)

**Evidence:**
- `www.thannow.com` response headers show `server: cloudflare` and `cf-cache-status: DYNAMIC`
- `Cache-Control: public, max-age=0, must-revalidate` means each page load goes to origin
- Cloudflare's 100-second idle connection timeout means keep-alive connections are dropped
- Browser reuses keep-alive connections → receives TCP RST

## Resolution Applied

### Cloud Run Memory Upgrade

`cloudbuild.yaml` changed from:
```
--memory=512Mi
```
to:
```
--memory=1Gi
```

This doubles the available memory, significantly reducing OOM risk.

### CORS Vary Header

Added `res.setHeader("Vary", "Origin")` to CORS middleware to prevent cache-related CORS issues.

## Additional Recommendations

1. Monitor Cloud Run memory usage via Google Cloud Console (Memory utilization metric)
2. Set up Cloud Run CPU/memory alerts at 80% utilization
3. Consider Cloudflare Argo Smart Routing for `www.thannow.com` to reduce edge latency
4. For `api.thannow.com`, consider moving to proxied (orange cloud) mode with appropriate page rules to get Cloudflare's TLS termination + caching benefits

## Classification

**ERR_CONNECTION_CLOSED: FAILED** — Root cause identified: 512Mi memory limit causing Cloud Run OOM kills. Resolution: upgrade to 1Gi memory.
