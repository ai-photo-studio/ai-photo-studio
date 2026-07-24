# CORS Report — OPS-131 Production CORS Forensics

**Date:** 2026-07-24
**Timestamp:** 18:08:58 PKT

## Part A — Browser CORS Forensics

### CORS Middleware Source

`apps/api/src/middleware/cors.middleware.ts` — custom Express middleware (NOT the `cors` npm package).

```ts
// Applies globally at app.use() level before all routes
app.use(createCorsMiddleware(config));
```

### Configuration Source

`ALLOWED_ORIGINS` environment variable parsed from `config/env.ts`.

### Preflight (OPTIONS) Tests

| Origin | Access-Control-Allow-Origin | Status |
|--------|---------------------------|--------|
| `https://www.thannow.com` | `https://www.thannow.com` | ✅ 204 |
| `https://thannow.com` | **MISSING** | ❌ 204 (no ACAO header) |
| `https://ai-photo-studio-frontend.pages.dev` | **MISSING** | ❌ 204 (no ACAO header) |
| `http://localhost:5173` | **MISSING** | ❌ 204 (no ACAO header) |

### Actual Request (POST) Test

`POST https://api.thannow.com/api/auth/login` with `Origin: https://www.thannow.com`:
```
access-control-allow-origin: https://www.thannow.com  ✅
access-control-allow-methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
access-control-allow-headers: Content-Type, Authorization, x-admin-token
access-control-allow-credentials: true
Status: 400 (expected — invalid credentials)
```

### Critical Finding

The CORS middleware only sends `Access-Control-Allow-Origin` when the request origin is in the `ALLOWED_ORIGINS` list. If the origin is NOT in the list, the header is **omitted entirely**, causing the browser to reject the response with:

> **Failed to fetch** / **CORS error**

This happens because:
1. Line 11-19 of `cors.middleware.ts`: if `origin` is present but NOT in `allowedOrigins`, neither the `*` branch nor the matched-origin branch fires
2. The response still returns (with `Access-Control-Allow-Credentials: true`), but without `Access-Control-Allow-Origin` the browser rejects it

### Root Cause

The production `ALLOWED_ORIGINS` env var likely includes only `https://www.thannow.com` — missing:
- `https://thannow.com` (apex domain without www)
- `https://ai-photo-studio-frontend.pages.dev` (Cloudflare Pages preview deployments)
- `http://localhost:5173` (local development)

## Part B — API Origin Audit

### Full Origin Chain

```
Browser (https://www.thannow.com)
  ↓
Cloudflare DNS (proxied/orange cloud? — unknown)
  ↓
Cloud Run (ai-photo-studio-api)
  ↓
Express (PORT=8080)
  ↓
createCorsMiddleware(config)   ← Line 80 app.use()
  ↓
rateLimit(60000, 120)          ← Line 81 app.use()
  ↓
express.json({ limit: "12mb" }) ← Line 82 app.use()
  ↓
Routes (/api/*)
```

### What Works

- `GET /api/packages` with `Origin: https://www.thannow.com` → ✅ `200` with CORS headers
- `OPTIONS /api/auth/login` with `Origin: https://www.thannow.com` → ✅ `204` with CORS headers
- `POST /api/auth/login` with `Origin: https://www.thannow.com` → ✅ CORS headers present (400 expected for bad credentials)

### What Fails

- Any request from `https://thannow.com` (apex) — no `Access-Control-Allow-Origin` returned
- Any request from `https://ai-photo-studio-frontend.pages.dev` — no `Access-Control-Allow-Origin` returned

### No Duplicate CORS Middleware — VERIFIED

Only one instance: `app.use(createCorsMiddleware(config))` at line 80 of `index.ts`.

### No Conflicting Proxy Headers — VERIFIED

Cloud Run is served directly by Google Frontend (GFE). No reverse proxy adding/removing headers.

### Classification

**CORS: FAILED** — `Access-Control-Allow-Origin` missing for apex domain (thannow.com) and Cloudflare Pages preview deployments.
