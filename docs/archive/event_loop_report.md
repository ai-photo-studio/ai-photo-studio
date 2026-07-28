# Event Loop Report — OPS-154

## Instrumentation Added

`event-loop-monitor.service.ts` measures event loop lag by scheduling a `setImmediate` callback every 5 seconds and measuring the delay between the timer firing and the callback executing.

## Thresholds

| Level | Threshold | Action |
|-------|-----------|--------|
| Warning | > 100ms | Logged as `warn` |
| Critical | > 500ms | Logged as `error` |

## Expected Results

In production:
- **Synchronous image processing** (pixel analysis, damage mask generation) runs in-memory and completes in <100ms
- **Sharp/Filesystem** operations like `gM` image library reads/writes are async
- **Large uploads** (up to 10MB) handled by Express body parser, streaming
- **JSON serialization** on large responses (order listings) may cause short blocking

Maximum expected event loop delay under normal conditions: **< 50ms**
Maximum expected event loop delay during image processing: **< 200ms**

If event loop lag exceeds 500ms, it indicates a synchronous blocking operation that can cause:
- Connection timer fires (cloud run / cloudflare timeouts)
- Watchdog timeout triggers
- Socket timeout mid-request
- ERR_CONNECTION_CLOSED on client side

## Monitoring

Event loop metrics exposed at `GET /api/monitoring/connections` under `eventLoop` key.
