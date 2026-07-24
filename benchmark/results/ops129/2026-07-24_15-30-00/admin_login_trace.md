# OPS-129 — Admin Login Trace

**Date:** 2026-07-24

## Trace: Browser → API → AdminAuthService → Database

### Step 1: POST /api/admin/auth/login
```http
POST https://api.thannow.com/api/admin/auth/login
Content-Type: application/json

{"email":"nazimsaeed@gmail.com","password":"Lahore!23"}
```

### Step 2: AdminAuthService.login() (production)
```ts
async login(email, password) {
    const admin = await prisma.adminUser.findUnique({ where: { email } });
    // BUG (pre-fix): password !== process.env.ADMIN_BOOTSTRAP_PASSWORD
    // FIX (OPS-127):  !verifyPassword(password, admin.passwordHash)
}
```

### Step 3: Database Query
```sql
SELECT * FROM "AdminUser" WHERE email = 'nazimsaeed@gmail.com';
```
Result: No rows returned (user does not exist).

## Current Status

| Check | Status | Evidence |
|-------|--------|----------|
| API health | ✅ VERIFIED | 200 OK |
| Login endpoint | ✅ VERIFIED | POST returns 401 (correct — user doesn't exist) |
| Auth code fix | ✅ VERIFIED (code) | PBKDF2 comparison committed in OPS-127 |
| Bootstrap env vars | ❌ NOT SET | `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` not in Northflank env |
| Admin user exists | ❌ FAILED | User `nazimsaeed@gmail.com` not found in `AdminUser` table |

## Resolution Path

1. Set env vars on Northflank:
   - `ADMIN_BOOTSTRAP_EMAIL=nazimsaeed@gmail.com`
   - `ADMIN_BOOTSTRAP_PASSWORD=Lahore!23`
   - `ADMIN_BOOTSTRAP_NAME=Nazim Saeed`
   - `ADMIN_BOOTSTRAP_ROLE=SUPER_ADMIN`

2. Restart Northflank service (auto-deploy or manual restart)

3. On restart, `bootstrapFirstAdmin()` will:
   - Check if admin user exists
   - If not, create with properly hashed password via `hashPassword(input.password)`
   - Set role to SUPER_ADMIN

4. Verify login succeeds and returns JWT
