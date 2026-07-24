# OPS-127 — Admin Verification

**Date:** 2026-07-24

## Admin Authentication Bug (CRITICAL)

**Status:** FAILED (FIXED IN CODE — pending deployment)

A critical authentication bug was discovered in `admin-auth.service.ts`:

### Original Code (Broken)
```ts
async login(email: string, password: string) {
    const admin = await prisma.adminUser.findUnique({ where: { email } });
    // ...
    if (password !== process.env.ADMIN_BOOTSTRAP_PASSWORD) {  // ← BUG
      throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }
```

**Issue:** The login method compared the submitted password against the `ADMIN_BOOTSTRAP_PASSWORD` environment variable instead of verifying against the stored password hash. Without this env var set in production, ALL admin logins returned "Invalid credentials".

### Bootstrap Bug
```ts
async bootstrapFirstAdmin(input) {
    // ...
    return prisma.adminUser.create({
      data: {
        passwordHash: "bootstrap",  // ← BUG: hardcoded, not the actual hash
      }
    });
}
```

**Issue:** Bootstrap creates users with a hardcoded `"bootstrap"` string as passwordHash instead of the proper PBKDF2 hash.

### Fixed Code
Both issues fixed:
1. Login now uses `verifyPassword(password, admin.passwordHash)` for proper PBKDF2 verification
2. Bootstrap now uses `hashPassword(input.password)` to store the proper hash

## Admin Login Test

| Step | Attempt | Result |
|------|---------|--------|
| Login with nazimsaeed@gmail.com/Lahore!23 | Before code fix | **FAILED** — INVALID_CREDENTIALS (due to login bug) |
| Login with nazimsaeed@gmail.com/Lahore!23 | After code fix + deployment | **PENDING** — requires deployment to Cloud Run |

## Admin Dashboard

| Feature | Status | Notes |
|---------|--------|-------|
| Login endpoint | ✅ VERIFIED (code) | Now uses proper password verification |
| Dashboard endpoint | ✅ VERIFIED (code) | GET /admin/dashboard returns metrics |
| Business analytics endpoint | ✅ VERIFIED (code) | GET /admin/business-metrics returns data |
| OPS-125 analytics frontend | ✅ VERIFIED (live) | Deployed to Cloudflare Pages (b5e83b66) |
| Package manager | ✅ VERIFIED (code) | POST /admin/packages for upsert |
| Admin routes secured | ✅ VERIFIED (code) | All requireAdminAuth with role RBAC |

## Deployment Steps

To make admin login work:

1. Deploy API to Cloud Run:
```bash
gcloud run deploy ai-photo-studio-api \
  --region us-central1 \
  --source . \
  --set-env-vars "ADMIN_BOOTSTRAP_EMAIL=nazimsaeed@gmail.com,ADMIN_BOOTSTRAP_PASSWORD=Lahore!23"
```

2. Verify login:
```bash
curl -X POST https://api.thannow.com/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"nazimsaeed@gmail.com","password":"Lahore!23"}'
```

3. If login succeeds, create packages via admin API:
```bash
curl -X POST https://api.thannow.com/api/admin/packages \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"code":"STARTER","name":"Starter","price":"1499.00",...}'
```
