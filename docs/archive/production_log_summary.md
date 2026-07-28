# Production Log Summary — OPS-153

## 24-Hour Log Classification (2026-07-25 to 2026-07-26)

| Event Type | Count | Details |
|------------|-------|---------|
| **WORKER_RESTART** | **501** | Worker watchdog fires every ~2.9 minutes |
| **MEMORY_WATCHDOG** | **501** | Secondary — always follows WORKER_RESTART |
| WORKER_WATCHDOG reset | 9 | Failure counter reset after 120s no new failures |
| Original image cleanup failed | 24 | Side effect of watchdog restarts |
| HTTP 500 | 26 | 13 from `/api/previews/background-removal`, 13 from restoration polling |

## ERROR Logs

The only error-level messages are from the memory watchdog:
```
MEMORY_WATCHDOG triggering restart — heap usage exceeds threshold
```
These occur at the same timestamps as WORKER_RESTART events. The memory watchdog is NOT the primary cause — it fires because the worker watchdog has already set the service to unhealthy.

## WARN Logs

All warn-level messages are:
```
WORKER_RESTART triggered by watchdog
```
and
```
WORKER_WATCHDOG resetting failure counter due to time without new failures
```

## HTTP 500 Analysis

### /api/previews/background-removal (13 requests)
Expected. This is a legacy endpoint from the removed HomePage. Returns 500 because RunPod is disabled.

### /api/restorations/:id (13 requests to same order)
13 sequential requests to order `cms013u560004tw390zx7ap8f` between 07:19 and 07:28 on July 25. Each returns HTTP 500. These are poll requests from `RestoreOrderPage` that fail because the worker health was set to unhealthy by the watchdog.

**Pattern:** 13 requests over ~9 minutes (every ~42s), all failing with 500. This matches the watchdog restart cycle.

## NO UNCAUGHT EXCEPTIONS FOUND
## NO PROCESS EXITS FOUND
## NO SIGTERM/SIGKILL FOUND
## NO CONTAINER OOM FOUND
## NO STARTUP FAILURES FOUND
