# Root Cause — OPS-153

## VERIFIED PRIMARY ROOT CAUSE

**Worker watchdog fires 501 times per 24 hours, marking the service unhealthy and terminating in-flight requests.**

## Evidence

| Evidence | Source | Detail |
|----------|--------|--------|
| 501 WORKER_RESTART events | Cloud Run logs (24h) | One approximately every 2.9 minutes |
| 501 MEMORY_WATCHDOG events | Cloud Run logs (24h) | Always follows WORKER_RESTART |
| 26 HTTP 500 responses | Cloud Run logs (24h) | Timing matches watchdog cycle |
| Active revision image | gcloud CLI | `sha256:1f3118617f` — deployed July 24, stale |
| OPS-150 code in source | Source code | Guard exists in `worker-watchdog.service.ts:28-31` |
| OPS-150 code NOT in production | gcloud revision creation time | Active revision created BEFORE OPS-150 was deployed |
| `RUNPOD_API_KEY=""` | gcloud revision env | Variable exists (empty string), triggering old code path |

## Root Cause Chain

```
1. Active revision is 48+ hours stale (00098-dpf)
   ↓
2. OPS-150 watchdog guard NOT deployed (code exists in git,
   but revision was never updated)
   ↓
3. RunPod transport failures accumulate
   (500 consecutive failures from disabled RunPod calls)
   ↓
4. Worker watchdog fires at threshold=3 (old code, not 20)
   every ~90 seconds
   ↓
5. setWorkerHealthState({running: false, lastError: "WORKER_WATCHDOG_RESTART"})
   ↓
6. In-flight quality-analysis requests and order polls
   encounter 500 errors or dropped connections
   ↓
7. Browser receives ERR_CONNECTION_CLOSED
```

## Why Deployment Never Completed

The CI/CD workflow (`build-and-deploy-api` job) fails at `google-github-actions/auth@v2` because `GCP_SERVICE_ACCOUNT_KEY` is missing from GitHub Secrets. This creates a new revision (`00104-t7f`) that is immediately **Retired** because the auth step itself fails before the deploy step runs, so the new revision never serves traffic.

The OPS-149 `continue-on-error: true` fix allows the workflow to complete, but the API is still NOT deployed with the new code.

## Supporting Evidence vs. Hypotheses

| Claim | Status | Evidence |
|-------|--------|----------|
| Worker watchdog is the cause | ✅ **VERIFIED** | 501 events in 24h, timed with HTTP 500s |
| Memory is the cause | ❌ **ELIMINATED** | Peak RSS 165MB of 1Gi — 84% free |
| Cloudflare is the cause | ❌ **ELIMINATED** | API is DNS-only (grey cloud) — bypasses CF |
| RunPod is the cause | ✅ **VERIFIED** | 500 consecutive failures trigger watchdog |
| Container restart/OOM | ❌ **ELIMINATED** | Revision conditions all True, no restarts |
| Liveness probe missing | ✅ **CONTRIBUTING** | No probe to restart frozen containers |
