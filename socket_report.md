# Socket Report — OPS-154

## Instrumentation

Socket statistics are tracked by `connection-lifecycle.middleware.ts` via Express `req.socket` events:

| Event | Tracking |
|-------|----------|
| OPEN | Incremented per request |
| CLOSE (no error) | Decremented active, incremented closed |
| CLOSE (hadError) | Decremented active, incremented destroyed |
| Keep-alive reuse | Not currently tracked (would require lower-level HTTP server instrumentation) |

## Expected Baseline

For a typical production instance with 1 CPU, 1Gi memory:
- **Active sockets**: 1-5 (low traffic restorations site)
- **Max concurrent seen**: Under 10 with min-instances=1
- **Destroyed sockets**: Should be 0 in normal operation (non-zero indicates ERR_CONNECTION_CLOSED)
- **Keep-alive reuse**: Node.js HTTP server reuses sockets automatically

## What Destroyed Sockets Mean

A destroyed socket (`close` event with `hadError=true`) indicates:
- The client disconnected before the server finished (browser tab closed, user navigated away)
- A load balancer health check timeout
- A watchdog restart causing all in-flight sockets to close

If `destroyed` > 0, it directly indicates `ERR_CONNECTION_CLOSED` occurrences on the client.

## Monitoring

Socket metrics exposed at `GET /api/monitoring/connections` under `sockets` key.
