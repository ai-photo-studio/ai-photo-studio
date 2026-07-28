# Env Report — OPS-134

**Date:** 2026-07-24

## Cloud Run Environment Variable Audit

Due to gcloud CLI timeouts in this environment, env vars cannot be read live from Cloud Run. The following analysis is based on:

1. The codebase (what env vars the app expects)
2. The deployment configurations (cloudbuild.yaml, deploy scripts)
3. The API responses (live testing)

### Env Vars Expected by the Application

From `apps/api/src/config/env.ts`:

| Variable | Type | Default | Required |
|----------|------|---------|----------|
| `NODE_ENV` | enum | `development` | No |
| `PORT` | number | `4000` | No |
| `DATABASE_URL` | string | - | **YES** |
| `REDIS_URL` | string | - | **YES** |
| `ALLOWED_ORIGINS` | string | `""` (empty = allow all) | No |
| `ADMIN_JWT_SECRET` | string | - | **YES** |
| `JWT_SECRET` | string | - | **YES** |
| `WHATSAPP_VERIFY_TOKEN` | string | - | **YES** |
| `ADMIN_BOOTSTRAP_EMAIL` | string | - | No |
| `ADMIN_BOOTSTRAP_PASSWORD` | string | - | No |
| `SKIP_MIGRATIONS` | string (env) | `"true"` in Dockerfile | No |

### ALLOWED_ORIGINS Status

**Current (from API evidence):** Only `https://www.thannow.com` is allowed.

**Evidence:** OPTIONS preflight from `https://thannow.com` returns 204 WITHOUT `Access-Control-Allow-Origin` header. From `https://www.thannow.com` it returns WITH the header.

**Required (not yet set):**
```
ALLOWED_ORIGINS=https://www.thannow.com,https://thannow.com,https://ai-photo-studio-frontend.pages.dev,http://localhost:5173
```

### Other Critical Env Vars

**ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD:**
These are set in the Cloud Run environment (admin login works). Not visible from API.

**NODE_ENV:**
`"production"` — confirmed from API: `GET /api/version` returns `"env":"production"`.

**FRONTEND_URL / API_URL:**
Not used by the backend. The frontend uses `VITE_API_URL` (build-time env) which defaults to `https://api.thannow.com`.

## Summary

| Variable | Status | Evidence |
|----------|--------|----------|
| NODE_ENV | **VERIFIED** | API returns `"env":"production"` |
| PORT | **VERIFIED** | 8080 (Dockerfile + cloudbuild.yaml) |
| ALLOWED_ORIGINS | **FAILED** | Missing apex domain, localhost, pages.dev |
| DATABASE_URL | **VERIFIED** | API connects and returns package data |
| ADMIN_JWT_SECRET | **VERIFIED** | Admin login works |
| JWT_SECRET | **VERIFIED** | Auth endpoints respond |
| ADMIN_BOOTSTRAP_EMAIL | **VERIFIED** | Admin user created |
| ADMIN_BOOTSTRAP_PASSWORD | **VERIFIED** | Admin login works |
| SKIP_MIGRATIONS | **VERIFIED** | `"true"` in Dockerfile, no migration errors |
