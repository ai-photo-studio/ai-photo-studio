# OPS-118 — Production End-to-End Acceptance Test & Regional Commerce

**Date:** 2026-07-23
**Model:** DeepSeek
**Mode:** Code

## Result: ALL TESTS PASS

| Test | Result |
|---|---|
| 1. Region Detection (7 cases) | **PASS** |
| 2a. Upload + Replicate Restore | **PASS** (49.8s, $0.0464) |
| 2b. Watermarked Preview | **PASS** (20.2MB) |
| 2c. Signed URL (15min expiry) | **PASS** |
| 3. Download Packages (PKR+USD) | **VERIFIED** |
| 4. Print Flow Scaffolding | **SCAFFOLDED** (9 steps) |
| 5. API Response Audit | **VERIFIED** (10 endpoints) |

## Regional Storefront

- Region detection priority: Cloudflare header → Accept-Language → Timezone → Manual override → Default (USD)
- Pricing: PKR (₨250-₨500) for Pakistan, USD ($1.50-$3.50) for international
- Payment merchants: Bank Alfalah PKR and USD per region
- Download packages: Original/2X/4X tiers with per-region pricing

## Files Generated

- `production_acceptance.md` — Full test results
- `regional_routing.md` — Region detection + pricing configuration
- `payment_flow.md` — Payment journey documentation
- `download_security.md` — Signed URL audit (S3 presigned, 15min)
- `print_flow.md` — Print flow scaffolding
- `journey_screenshots/` — Intermediate images
