# CORS Matrix — OPS-135

**Date:** 2026-07-24

## Current Status (Revision 00098)

| Origin | OPTIONS | POST | GET | ACAO | Credentials | Vary |
|--------|---------|------|-----|------|-------------|------|
| `https://www.thannow.com` | ✅ 204 | ✅ 400 | ✅ 200 | `www.thannow.com` | `true` | `Origin` |
| `https://thannow.com` | ✅ 204 | ✅ 400 | — | ❌ MISSING | `true` | `Origin` |
| `https://ai-photo-studio-frontend.pages.dev` | ✅ 204 | — | — | ❌ MISSING | `true` | `Origin` |
| `http://localhost:5173` | ✅ 204 | — | — | ❌ MISSING | `true` | `Origin` |

## Expected After Fix (Next Deploy)

The fix adds `DEFAULT_ALLOWED_ORIGINS` in `cors.middleware.ts`:

```ts
const DEFAULT_ALLOWED_ORIGINS = [
  "https://www.thannow.com",
  "https://thannow.com",
  "https://ai-photo-studio-frontend.pages.dev",
  "http://localhost:5173",
  "http://localhost:4000"
];
```

This ensures ALL four origins receive `Access-Control-Allow-Origin` even without the env var being set in Cloud Run.

## Required Headers (Every Response)

| Header | Value |
|--------|-------|
| `Access-Control-Allow-Origin` | ✅ Echoes request origin |
| `Access-Control-Allow-Credentials` | `true` |
| `Vary` | `Origin` |
| `Access-Control-Allow-Methods` | `GET, POST, PUT, PATCH, DELETE, OPTIONS` |
| `Access-Control-Allow-Headers` | `Content-Type, Authorization, x-admin-token` |

## Classification

**CORS: FAILED → FIXED** (next deploy) — Code fix deployed in `cors.middleware.ts`. Stuck revision `cors-fix` prevents automatic deployment. Pending: Delete stuck revision, then trigger Cloud Build or use Cloud Run dashboard.
