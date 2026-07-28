# Cloud Run Runtime Investigation — OPS-150

## Service
**Name:** ai-photo-studio-api
**Region:** us-central1
**Active revision:** `ai-photo-studio-api-00098-dpf` (100% traffic)
**Image digest:** `sha256:1f3118617f`
**Deployed:** July 24, 2026 15:02 UTC — **27+ hours stale**
**Resources:** 1 CPU, 1Gi memory
**Min instances:** 1 (always warm)
**Port:** 8080 (HTTP/1)
**Startup probe:** TCP socket, 240s timeout
**Liveness probe:** NOT CONFIGURED
**Readiness probe:** NOT CONFIGURED

## ERR_CONNECTION_CLOSED — EXACT ROOT CAUSE

### Primary Cause: Worker Watchdog Fires Every 2 Minutes

**File:** `apps/api/src/services/worker-watchdog.service.ts`

The worker watchdog checks `getConsecutiveFailures()` from `runpod.transport.ts` every 30 seconds. Since RunPod is **disabled** (no `RUNPOD_API_KEY` in production), every legacy RunPod call fails incrementing the failure counter. When it reaches 3 consecutive failures, the watchdog calls `onRestart()` which sets `workerHealth` to an unhealthy state.

Timeline:
```
T=0     RunPod call fails → failures=1
T=30s  RunPod call fails → failures=2
T=60s  RunPod call fails → failures=3 → WORKER_RESTART triggered
T=120s No new failures → counter resets (WATCHDOG_RESET_ON_SUCCESS_MS)
T=150s RunPod call fails → failures=1 → cycle repeats
```

Every ~2 minutes, the watchdog fires. During the window when `workerHealth` is `running: false`, in-flight requests may encounter:
- HTTP 500 errors
- Connection termination when the app sets unhealthy state
- Cloudflare upstream disconnect → `ERR_CONNECTION_CLOSED`

### Secondary: Missing Liveness Probe

No liveness probe is configured. If the application freezes or enters a bad state, Cloud Run has no way to detect and restart it automatically.

### Evidence from Logs

**WORKER_RESTART events (hundreds over 24 hours):**
```
2026-07-25T15:59:42Z | WORKER_RESTART triggered by watchdog
2026-07-25T15:57:42Z | WORKER_RESTART triggered by watchdog
2026-07-25T15:55:42Z | WORKER_RESTART triggered by watchdog
...every 2 minutes across entire day...
```

**MEMORY_WATCHDOG events (at same times, following restarts):**
```
2026-07-25T15:57:42Z | MEMORY_WATCHDOG: heap 32MB/35MB = 91% threshold exceeded
```
The memory watchdog fires because V8 GC hasn't released memory after the worker restart, but this is a secondary effect, not the root cause.

### Root Cause Chain
1. Legacy RunPod transport code still runs → failures increment
2. Worker watchdog hits threshold → marks unhealthy
3. Application enters degraded state mid-request
4. Cloudflare upstream connection closes → `ERR_CONNECTION_CLOSED`

## Other Issues Found

### HTTP 429 on POST /api/restorations
Rate limit of 10 requests per 60 seconds. With the OPS-148 double-click fix deployed to frontend, this should no longer occur.

### HTTP 500 on /api/previews/background-removal
Legacy endpoint from the removed HomePage, still being called by cached clients.

### CI/CD: New Revisions Never Serve Traffic
Revision `00104-t7f` was created but **Retired** because `google-github-actions/auth@v2` fails (missing `GCP_SERVICE_ACCOUNT_KEY`). The OPS-147 fetch timeout fixes are NOT deployed.

## Revision History

| Revision | Created | Status | Notes |
|----------|---------|--------|-------|
| 00104-t7f | Jul 24 17:12 | Retired | Latest code (OPS-147). Never served traffic. |
| cors-fix | Jul 24 15:36 | Retired | Never served traffic |
| **00099-dwc** | Jul 24 15:08 | **Failed** | Container startup error (port bind issue) |
| **00098-dpf** | Jul 24 15:02 | **Active** | **Serving 100% traffic. 27+ hours stale.** |

## Recommended Fixes

1. **Disable the worker watchdog** or increase its threshold since RunPod is intentionally disabled
2. **Add a liveness probe** to the Cloud Run service so unhealthy containers are detected
3. **Stop calling RunPod transport** from legacy code paths (or add a feature flag)
4. **Add the `GCP_SERVICE_ACCOUNT_KEY` GitHub secret** so the CI/CD can deploy the new revision with OPS-147 fixes
