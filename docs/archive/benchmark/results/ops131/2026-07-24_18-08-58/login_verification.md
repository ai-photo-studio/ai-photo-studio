# Login Verification — OPS-134

**Date:** 2026-07-24

## Production Endpoint Tests

### 1. `https://www.thannow.com` (Frontend homepage)
```
GET / → 200 OK
Server: cloudflare
cf-cache-status: DYNAMIC
CF-RAY: a2037acb3e124ad0-MRS
```
**VERIFIED** — Frontend serving via Cloudflare

### 2. `https://thannow.com` (Apex domain)
Redirects to `https://www.thannow.com` (Cloudflare Pages handles apex)

### 3. `https://api.thannow.com` (API)
```
GET /api/health → 200 OK
GET /api/version → {"env":"production"}
GET /api/packages → 200 OK, 4 packages
Server: Google Frontend
```
**VERIFIED** — API running on Cloud Run

### 4. Admin Login POST — `www.thannow.com` origin

```
POST /api/admin/auth/login
Origin: https://www.thannow.com
Content-Type: application/json
Authorization: Bearer test

→ 400 Bad Request
  access-control-allow-origin: https://www.thannow.com ✅
  access-control-allow-methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
  access-control-allow-headers: Content-Type, Authorization, x-admin-token
  access-control-allow-credentials: true
  vary: Origin ✅
```
**VERIFIED** — Admin login CORS works from `www.thannow.com`

### 5. Admin Login OPTIONS — `www.thannow.com` origin

```
OPTIONS /api/admin/auth/login
Origin: https://www.thannow.com
Access-Control-Request-Method: POST
Access-Control-Request-Headers: content-type, authorization

→ 204 No Content
  access-control-allow-origin: https://www.thannow.com ✅
  access-control-allow-credentials: true
  vary: Origin ✅
```
**VERIFIED** — Preflight works

### 6. Admin Login OPTIONS — `thannow.com` apex origin

```
OPTIONS /api/admin/auth/login
Origin: https://thannow.com

→ 204 No Content
  (NO access-control-allow-origin — ❌ FAILED)
  vary: Origin
```
**FAILED** — Missing ACAO for apex domain

## Summary

| Test | Status | CORS | Vary |
|------|--------|------|------|
| Frontend | ✅ 200 | N/A | N/A |
| API Health | ✅ 200 | N/A | N/A |
| API Packages | ✅ 200 | www ✅, apex ❌ | ✅ |
| Admin OPTIONS (www) | ✅ 204 | ✅ | ✅ |
| Admin OPTIONS (apex) | ✅ 204 | ❌ | ✅ |
| Admin POST (www) | ✅ 400 | ✅ | ✅ |
| Admin POST (apex) | ✅ 400 | ❌ | ✅ |
| Customer POST (www) | ✅ 400 | ✅ | ✅ |
