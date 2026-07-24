# OPS-129 — Package Seed Report

**Date:** 2026-07-24

## Current State (Pre-Fix)

`GET https://api.thannow.com/api/packages` returns:
```json
{"success":true,"data":[]}
```

**Status:** ❌ FAILED — 0 active packages in production database.

## Database Package State

All packages defined in `prisma/seed.ts` are listed below. Production is expected to have 0 rows in the `Package` table (seed never run).

| Code | Name | Price (PKR) | Credits | Active |
|------|------|-------------|---------|--------|
| STARTER | Starter | 1,499 | 10 | true |
| PRO | Pro | 3,499 | 25 | true |
| BUSINESS | Business | 6,999 | 60 | true |
| DEALER | Dealer | 9,999 | 100 | true |

## Admin API Package Endpoints

| Method | Endpoint | Auth | Action |
|--------|----------|------|--------|
| GET | `/api/packages` | None | List active packages |
| GET | `/api/admin/packages` | Admin (SUPER_ADMIN) | List all packages |
| POST | `/api/admin/packages` | Admin (SUPER_ADMIN) | Create/update package |

## Package Creation via Admin API

After admin login, packages can be created via:

```bash
# Login
TOKEN=$(curl -s -X POST https://api.thannow.com/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"nazimsaeed@gmail.com","password":"Lahore!23"}' | jq -r '.token')

# Create STARTER
curl -X POST https://api.thannow.com/api/admin/packages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"STARTER","name":"Starter","price":"1499.00","active":true,"creditsIncluded":10,"monthlyCreditLimit":10,"workflowType":"PRODUCT","workflowMode":"WHITE_BACKGROUND","description":"Best for new stores that want a clean, fast launch kit","includesJson":{"services":["background_removal","white_background","basic_retouch"]}}'

# Create PRO
curl -X POST https://api.thannow.com/api/admin/packages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"PRO","name":"Pro","price":"3499.00","active":true,"creditsIncluded":25,"monthlyCreditLimit":25,"workflowType":"PRODUCT","workflowMode":"SHADOW_ENHANCEMENT","description":"Popular package for sellers who need polished product visuals","includesJson":{"services":["background_removal","white_background","shadow_enhancement","resize"]}}'

# Create BUSINESS
curl -X POST https://api.thannow.com/api/admin/packages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"BUSINESS","name":"Business","price":"6999.00","active":true,"creditsIncluded":60,"monthlyCreditLimit":60,"workflowType":"PRODUCT","workflowMode":"PRODUCT_STUDIO","description":"Advanced package for growing brands and campaigns","includesJson":{"services":["background_removal","product_studio","resize","brightness","batch_support"]}}'

# Create DEALER
curl -X POST https://api.thannow.com/api/admin/packages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"DEALER","name":"Dealer","price":"9999.00","active":true,"creditsIncluded":100,"monthlyCreditLimit":100,"workflowType":"VEHICLE","workflowMode":"SHOWROOM","description":"Vehicle-ready package for dealers and inventory teams","includesJson":{"services":["vehicle_showroom","premium_road","dark_studio","plate_blur"]}}'

# Verify
curl https://api.thannow.com/api/packages
# Expected: {"success":true,"data":[{...4 packages...}]}
```
