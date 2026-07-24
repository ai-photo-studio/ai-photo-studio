# OPS-127 — Package Initialization

**Date:** 2026-07-24

## Issue: Empty Package Data

`GET /api/packages` returns `{"success":true,"data":[]}` — no active packages in production database.

## Root Cause

The Prisma seed (`prisma/seed.ts`) which creates STARTER, PRO, BUSINESS, and DEALER packages has never been executed against the production Neon database. The admin upsert endpoint (`POST /api/admin/packages`) exists but requires admin authentication, which was also broken.

## Fix Applied: Admin Auth Bug (Code Change)

**File:** `apps/api/src/services/admin-auth.service.ts`

### Bug 1: Password comparison against env var instead of hash (line 32)

**BEFORE:**
```ts
if (password !== process.env.ADMIN_BOOTSTRAP_PASSWORD) {
  throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
}
```

This compared the submitted password directly against the `ADMIN_BOOTSTRAP_PASSWORD` environment variable. If the env var was not set (production), **all logins were rejected**.

**AFTER:**
```ts
if (!verifyPassword(password, admin.passwordHash)) {
  throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
}
```

Now uses proper PBKDF2-based password verification against the stored hash.

### Bug 2: Bootstrap creates user with hardcoded hash (line 96)

**BEFORE:**
```ts
passwordHash: "bootstrap",
```

**AFTER:**
```ts
const passwordHash = hashPassword(input.password);
return prisma.adminUser.create({ data: { ... passwordHash, ... } });
```

Now properly hashes the bootstrap password before storing.

## Admin User Creation

To create the admin user, deploy a new Cloud Run revision with:
```
ADMIN_BOOTSTRAP_EMAIL=nazimsaeed@gmail.com
ADMIN_BOOTSTRAP_PASSWORD=Lahore!23
```

The `bootstrapFirstAdmin()` method runs on every API startup and will create the user if not already present.

## Package Creation

Once admin authentication works, packages can be created via:
```
POST /api/admin/packages
Authorization: Bearer <admin_token>
Body: { "code": "STARTER", "name": "Starter", "price": "1499.00", ... }
```

Or by running `npm run prisma:seed` in the `apps/api` directory against the production database.

## Package Records to Create

| Code | Name | Price (PKR) | Credits | Active |
|------|------|-------------|---------|--------|
| STARTER | Starter | 1,499 | 10 | true |
| PRO | Pro | 3,499 | 25 | true |
| BUSINESS | Business | 6,999 | 60 | true |
| DEALER | Dealer | 9,999 | 100 | true |
