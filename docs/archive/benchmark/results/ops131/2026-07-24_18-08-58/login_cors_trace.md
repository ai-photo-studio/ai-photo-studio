# Login CORS Trace — OPS-133

**Date:** 2026-07-24

## Request Chain

```
Browser (https://www.thannow.com / https://thannow.com / localhost:5173)
  ↓
Cloudflare DNS (api.thannow.com → ghs.googlehosted.com — GREY CLOUD, NOT proxied)
  ↓
Google Front End (GFE)
  ↓
Express (Cloud Run, port 8080)
  ↓
createCorsMiddleware (app.use level, line 80)
  ↓
rateLimit
  ↓
express.json
  ↓
Routes (/api/admin/auth/login, /api/auth/login, etc.)
```

## Preflight (OPTIONS) Results

### Test 1: `https://www.thannow.com` ✅
```
OPTIONS /api/admin/auth/login
Origin: https://www.thannow.com
Access-Control-Request-Method: POST
Access-Control-Request-Headers: content-type, authorization

→ 204 No Content
  access-control-allow-origin: https://www.thannow.com
  access-control-allow-methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
  access-control-allow-headers: Content-Type, Authorization, x-admin-token
  access-control-allow-credentials: true
  server: Google Frontend
```

### Test 2: `https://thannow.com` ❌
```
OPTIONS /api/admin/auth/login
Origin: https://thannow.com
Access-Control-Request-Method: POST
Access-Control-Request-Headers: content-type, authorization

→ 204 No Content
  (NO Access-Control-Allow-Origin header — BROWSER REJECTS)
  access-control-allow-methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
  access-control-allow-headers: Content-Type, Authorization, x-admin-token
  access-control-allow-credentials: true
  server: Google Frontend
```

### Test 3: `http://localhost:5173` ❌
Same as Test 2 — missing `access-control-allow-origin`.

### Test 4: `https://ai-photo-studio-frontend.pages.dev` ❌
Same as Test 2 — missing `access-control-allow-origin`.

## POST Login Results

### Test 5: `https://www.thannow.com` ✅ CORS, ❌ 400 (expected)
```
POST /api/admin/auth/login
Origin: https://www.thannow.com

→ 400 Bad Request
  access-control-allow-origin: https://www.thannow.com  ✅
  access-control-allow-credentials: true               ✅
  (400 is correct — test credentials are invalid)
```

### Test 6: `https://thannow.com` ❌ CORS
```
POST /api/admin/auth/login
Origin: https://thannow.com

→ 400 Bad Request
  (NO Access-Control-Allow-Origin — browser blocks response)
```

## GET /api/packages

### Test 8: `https://www.thannow.com` ✅
```
GET /api/packages
Origin: https://www.thannow.com

→ 200 OK
  access-control-allow-origin: https://www.thannow.com ✅
  access-control-allow-credentials: true               ✅
```

## Root Cause

The `ALLOWED_ORIGINS` environment variable in Cloud Run is set to only `https://www.thannow.com`. The CORS middleware requires an exact match. Missing origins:

| Origin | Why Needed |
|--------|-----------|
| `https://thannow.com` | Apex domain — users visiting thannow.com directly |
| `https://ai-photo-studio-frontend.pages.dev` | Cloudflare Pages preview deployments |
| `http://localhost:5173` | Local development with Vite |

## CORS Header Consistency

Both success (204, 200) and failure (400) responses return **identical CORS headers**. This is correct — CORS headers must be present regardless of response status. ✅

## Vary Header

**Missing `Vary: Origin`** — Fixed in this commit. Without it, caches could serve responses to the wrong origin.

## Classification

**CORS: FAILED** — Origin whitelist incomplete. `Vary: Origin` missing (now fixed).
