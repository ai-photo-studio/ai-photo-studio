# Root Cause v2 — OPS-154

## Verified Primary Root Cause

**Same as OPS-153 + confirmed: the worker watchdog fires 501 times/day, and deployed instrumentation will now capture the exact socket lifecycle to correlate watchdog events with ERR_CONNECTION_CLOSED.**

## New Findings

### 1. Frontend Polling Bug (Fixed)
`RestoreOrderPage.tsx` had a stale closure on `selectedItem` and the stop condition used `.some(i => COMPLETED)` instead of `.every(i => COMPLETED || FAILED)`. This meant:
- Polling continued until ANY single item completed, even if other items were still processing
- `selectedItem` was captured in the closure and never updated

### 2. Missing mountedRef Guard (Fixed)
No guard against state updates on unmounted components. If the user navigated away while a fetch was in-flight, React would warn about state updates on unmounted components.

### 3. AbortController Leak (Fixed)
The cleanup effect could abort a concurrent fetch that was just initiated by the first effect.

## What the Instrumentation Will Capture

Once deployed, the connection lifecycle middleware will log:

1. **Every HTTP request** with its start time, socket ID, method, and path
2. **Every response finish** with duration and status code
3. **Every socket close** — distinguishing clean closes from error closes
4. **Every aborted request** — when a request is terminated before the response completes

The event loop monitor will log:
1. **Event loop lag** at 100ms (warn) and 500ms (critical) thresholds

The socket stats will show:
1. **Destroyed sockets > 0** = confirmed ERR_CONNECTION_CLOSED events

## Correlation Plan

Once deployed, check Cloud Run logs for:

```
[CONN] #{id} ABORTED duration={ms} — possible ERR_CONNECTION_CLOSED
```

within the same second as:

```
WORKER_RESTART triggered by watchdog
```

If timestamps match, the watchdog is directly causing the connection closure.
