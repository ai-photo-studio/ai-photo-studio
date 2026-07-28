# Connection Lifecycle — OPS-154

## Instrumentation Added

A new middleware `connection-lifecycle.middleware.ts` tracks every HTTP request through its full lifecycle:

| Event | Logged When | Format |
|-------|-------------|--------|
| OPEN | Request received | `[CONN] #{requestId} socket={port} OPEN {method} {path}` |
| FINISH | Response sent | `[CONN] #{requestId} FINISH status={code} duration={ms}` |
| CLOSE | Socket closed | `[CONN] #{requestId} CLOSE hadError={bool} duration={ms}` |
| ABORTED | Request aborted before completion | `[CONN] #{requestId} ABORTED duration={ms}` |

## Socket Statistics

Tracked in `getSocketStats()`:
- `opened` — total sockets opened since process start
- `closed` — total sockets closed
- `destroyed` — sockets closed with error
- `active` — currently open sockets
- `keepAliveReused` — reused connections (future tracking)
- `maxConcurrent` — peak concurrent sockets

## API Endpoint

`GET /api/monitoring/connections` returns:
```json
{
  "sockets": { "opened": 0, "closed": 0, "destroyed": 0, "active": 0, "keepAliveReused": 0, "maxConcurrent": 0 },
  "eventLoop": { "maxLagMs": 0, "totalChecks": 0, "warnCount": 0, "criticalCount": 0 },
  "uptimeSeconds": 0
}
```

## Aborted Request Detection

When a request is aborted before the response finishes (socket close without response), the middleware logs:
```
[CONN] #{requestId} ABORTED duration={ms} — possible ERR_CONNECTION_CLOSED
```
This will correlate with watchdog WORKER_RESTART events in Cloud Run logs, confirming the connection close is due to health state changes.
