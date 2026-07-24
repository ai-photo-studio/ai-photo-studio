# OPS-128 — Package Initialization

**Date:** 2026-07-24

## Current State

`GET https://api.thannow.com/api/packages` returns:

```json
{"success":true,"data":[]}
```

**Status:** ❌ FAILED — No active packages in production database.

## Prisma Seed Data

The following 4 packages are defined in `apps/api/prisma/seed.ts`:

| Code | Name | Price (PKR) | Credits | Monthly Limit | Workflow |
|------|------|-------------|---------|---------------|----------|
| STARTER | Starter | 1,499 | 10 | 10 | WHITE_BACKGROUND |
| PRO | Pro | 3,499 | 25 | 25 | SHADOW_ENHANCEMENT |
| BUSINESS | Business | 6,999 | 60 | 60 | PRODUCT_STUDIO |
| DEALER | Dealer | 9,999 | 100 | 100 | SHOWROOM |

## Resolution Path

### Option 1: Admin API (Recommended)

After admin login is fixed (OPS-127 deploy completes):

```bash
TOKEN="<jwt_from_login>"
curl -X POST https://api.thannow.com/api/admin/packages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"STARTER","name":"Starter","price":"1499.00","active":true,"creditsIncluded":10,"monthlyCreditLimit":10,"workflowType":"PRODUCT","workflowMode":"WHITE_BACKGROUND","description":"Best for new stores that want a clean, fast launch kit"}'

curl -X POST https://api.thannow.com/api/admin/packages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"PRO","name":"Pro","price":"3499.00","active":true,"creditsIncluded":25,"monthlyCreditLimit":25,"workflowType":"PRODUCT","workflowMode":"SHADOW_ENHANCEMENT","description":"Popular package for sellers who need polished product visuals"}'

curl -X POST https://api.thannow.com/api/admin/packages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"BUSINESS","name":"Business","price":"6999.00","active":true,"creditsIncluded":60,"monthlyCreditLimit":60,"workflowType":"PRODUCT","workflowMode":"PRODUCT_STUDIO","description":"Advanced package for growing brands and campaigns"}'

curl -X POST https://api.thannow.com/api/admin/packages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"DEALER","name":"Dealer","price":"9999.00","active":true,"creditsIncluded":100,"monthlyCreditLimit":100,"workflowType":"VEHICLE","workflowMode":"SHOWROOM","description":"Vehicle-ready package for dealers and inventory teams"}'
```

### Option 2: Prisma Seed

```bash
cd apps/api
DATABASE_URL=<production_neon_url> npx tsx prisma/seed.ts
```

### Verification

After initialization:
```bash
curl https://api.thannow.com/api/packages
# Expected: {"success":true,"data":[{...4 packages...}]}
```

## Impact

Without package data, the "Choose Your Package" step in the commerce workflow renders zero package cards. Customers cannot select a package and cannot proceed through the checkout flow.
