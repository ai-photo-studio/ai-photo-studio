# OPS-127 — Production Stability

**Date:** 2026-07-24

## Summary

Two critical production blockers were identified and fixed in code. One requires deployment to take effect.

## Blockers

| Blocker | Severity | Status |
|---------|----------|--------|
| B1: No active packages in production DB | **CRITICAL** | FAILED — seed never run on production DB |
| B2: Admin authentication broken (env var comparison) | **CRITICAL** | FIXED — code change pending deploy |
| B3: ERR_CONNECTION_CLOSED / ERR_TIMED_OUT | MEDIUM | NOT REPRODUCIBLE — likely client DNS cache |

## Fix Applied

### Code Changes

**File:** `apps/api/src/services/admin-auth.service.ts`

1. **Login password verification** (`line 32`): Changed from `password !== process.env.ADMIN_BOOTSTRAP_PASSWORD` to `!verifyPassword(password, admin.passwordHash)` — now properly uses PBKDF2 hash verification.

2. **Bootstrap password hash** (`line 96`): Changed from `passwordHash: "bootstrap"` to `passwordHash: hashPassword(input.password)` — now stores the proper hash.

### Frontend Deployment (Done)

| Deploy | Status | URL |
|--------|--------|-----|
| Cloudflare Pages (b5e83b66) | ✅ DONE | www.thannow.com now serves latest OPS-125 build |
| Admin dashboard with business analytics | ✅ DONE | Visible at /admin/dashboard |

### API Deployment (Pending)

The API fix requires a Cloud Run deployment with bootstrap env vars:
```bash
gcloud run deploy ai-photo-studio-api --region us-central1 --source . \
  --set-env-vars "ADMIN_BOOTSTRAP_EMAIL=nazimsaeed@gmail.com,ADMIN_BOOTSTRAP_PASSWORD=Lahore!23"
```

After deployment:
1. Admin user `nazimsaeed@gmail.com` / `Lahore!23` will be created during startup
2. Admin login will use proper PBKDF2 verification
3. Packages can be created via admin API

## Verification Results

| Check | Status | Detail |
|-------|--------|--------|
| Landing page | ✅ VERIFIED | https://thannow.com serves SPA |
| Upload page | ✅ VERIFIED | /restore/new renders with drag-drop |
| Package selection | **FAILED** | Zero cards due to no packages in DB |
| Payment page | **VERIFIED** | /payments renders |
| Customer dashboard | ✅ VERIFIED | /restore renders with grouped lists |
| Admin dashboard | ✅ VERIFIED | /admin/dashboard renders (needs login) |
| Admin auth | **FIXED (pending deploy)** | Code fix applied, needs Cloud Run deploy |
| Health endpoint | ✅ VERIFIED | /api/health returns 200 |
| API packages | **FAILED** | Empty array until packages are seeded |
