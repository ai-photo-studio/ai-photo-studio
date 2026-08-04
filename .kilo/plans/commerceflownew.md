    # Commerce Flow — Authoritative Business Specification

> **Status:** Frozen. Do not edit without board approval.
> **Date:** 2026-07-28
> **Source documents:** international_strategy.md, regional_routing.md, payment_gateway.md, MASTER_PRICING_MODEL.md, MASTER_CUSTOMER_JOURNEY.md, docs_03-PRICING-PACKAGES.md, docs_07-PAYMENT-FLOW.md, PrintPipeline.md, cost_savings.md, production_acceptance.md, MASTER_PRODUCT_VISION.md, docs_01-MVP-SCOPE.md, commerce.md (previous), pricing_forensics.md

---

## 1. Project Scope

Two services: **AI Product Photo Studio** (ecommerce sellers, credit-based packages) and **AI Old Photo Restoration** (per-image resolution tiers, Replicate, print).

## 2. Markets

| | Pakistan | International |
|---|----------|---------------|
| Currency | PKR | USD (derived from PKR base) |
| Payment | Bank Alfalah (JazzCash via Bank Alfalah) | Bank Alfalah USD. If unsupported: Stripe/PayPal (documented) |
| Delivery | Pakistan Post, download link | DHL, FedEx, UPS, download link |
| Printing | Local partners | International partners or digital-only |

## 3. Region Detection

`cf-ipcountry=PK` / `Accept-Language=ur` / `timezone=Asia/Karachi` → PKR. All others → USD. `x-region` header overrides. Default: USD.

## 4. PKR Model

### Download Pricing (Per Image)

| Resolution | PKR | USD | Replicate Cost | Margin (PKR) |
|-----------|-----|-----|---------------|-------------|
| Original | 250 | $1.50 | $0.046 (12.9) | 237 |
| 2X / 2HD | 350 | $2.50 | $0.046 (12.9) | 337 |
| 4X / 4HD | 500 | $3.50 | $0.046 (12.9) | 487 |
| 6X / 6HD | 750 | $3.50 | $0.046 | ~737 |
| 8X / 8HD | 1,000 | $4.50 | $0.046 | ~987 |
| 10X / 10HD | 1,250 | $5.50 | $0.046 | ~1,237 |
| 12X / 12HD | 1,500 | $6.50 | $0.046 | ~1,487 |

### Package Pricing (Product Photo Studio)

| Package | Price PKR | CreditsIncluded | MaxImages |
|---------|----------|-----------------|-----------|
| STARTER | 1,499 | 10 | 3 |
| PRO | 3,499 | 25 | 10 |
| BUSINESS | 6,999 | 60 | 25 |
| DEALER | 9,999 | 100 | 50 |

### Print Pricing

| Size | PKR (from) | USD (from) |
|------|-----------|-----------|
| 4x6 | 800 | $5 |
| 5x7 | 1,200 | $8 |
| 8x10 | 1,800 | $12 |
| A4 | 2,000 | $15 |
| A3 | 3,500 | $25 |

### Add-On Credits

Mini (499/3cr), Seller (999/8cr), Growth (2,499/25cr)

### Subscriptions

Seller Monthly (2,999/25cr), Store Monthly (5,999/60cr), Brand Monthly (12,999/150cr)

## 5. USD Model

**Found in archived documents.** USD pricing exists in:
- `international_strategy.md` — "USD prices derived from PKR base at current exchange rate"
- `regional_routing.md` — download pricing: $1.50, $2.50, $3.50; print pricing: $5-$25
- `MASTER_PRICING_MODEL.md` — "USD for international ecommerce sellers"
- `cost_savings.md` — revenue table with USD column ($1.50-$3.50)
- `payment_gateway.md` — "PKR (local), USD (international)"

USD is derived from PKR base pricing. Not a separate model. No separate USD-only packages exist.

## 6. Upgrade Rules

**Full-price rule:** Paying for an upgrade (e.g., single to multi-image, or lower to higher tier) requires the full price of the new tier/package. No discount for previous purchase.

## 7. Guest Flow

Upload (1 free preview/session), view watermarked preview, view client-side metadata, create order — all without auth. Download full-resolution, view history, purchase credits — require signup.

## 8. Registered User Flow

Register → Login → Upload → Select style → Credits deducted → Queue → Replicate → R2 → Download. Wallet shows balance. Payment via manual proof.

## 9. Admin Flow

Dashboard (PKR/USD revenue, pending payments), Orders (approve/reject, retry), Customers, Packages CRUD, Payments, Wallets (credit/refund), Subscriptions, Jobs, Logs, Settings.

## 10. Print Model

Print sizes exist in code. Print order flow NOT implemented. Print options (paper, frame, album, courier, shipping) NOT implemented.

## 11. Payment Model

Manual proof: ✅ Active. JazzCash/Easypaisa provider classes: ✅ Exist (inactive). Demo auto-approve: ❌ Not implemented. Payment guard on processItem: ✅ Active.

**Bank Alfalah gateway (updated 2026-08-04, R9.2-P4C):** Legacy "Alfa APG
v1.1" is retired and was never actually implemented in this repository (there
was nothing live to migrate off of). The owner-approved replacement is the
Bank Alfalah **Mastercard Gateway (MPGS)** sandbox
(`test-bankalfalah.gateway.mastercard.com`), implemented in
`apps/api/src/services/p4c-bank-alfalah-mpgs-gateway.service.ts`: Hosted
Checkout initiation from server-owned `FixedOrder`/`PaymentAttempt` values,
untrusted browser return, an always-performed Retrieve Order v74 call before
any paid transition, and delegation to the existing `applyVerifiedPaymentEvidence`
(P4A) transaction. PKR is enabled (standard-pattern-fallback evidence); USD
is fail-closed pending confirming documentation or a sandbox capability test.
Sandbox-only; not wired to any HTTP route yet and not activated in
production. See `docs/payments/bank-alfalah-mastercard/MPGS_INTEGRATION_EVIDENCE.md`.

**Restoration status/download flow + lint/browser harness (2026-08-05,
R9.2-P5A):** `GET /api/customer/restorations/:id` and
`GET /api/customer/restorations/:id/download/:itemId` (customer-scoped,
uniform 404 on wrong-owner/not-found, no guest-token fallback for
authenticated users, download requires `COMPLETED` item + `VALIDATED`
master, no `storageKey` in the customer DTO). No committed lint or browser
harness existed before this packet; a minimal ESLint 9 flat config
(`eslint.config.mjs`) and a minimal Chromium-only Playwright harness
(`apps/web/playwright.config.ts`, `apps/web/tests/browser/`, 13/13 passing)
were built from currently installed packages only. See
`docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` section 11.

## 12. Code Mapping

| Business Rule | Code Status |
|--------------|------------|
| Package catalog with creditsIncluded | ✅ prisma/seed.ts, Package model. Prod values = 0 |
| Wallet/credit system | ✅ WalletService, WalletTransaction model |
| Manual payment proof | ✅ ManualPaymentProvider, admin approval routes |
| Free preview | ✅ preview.controller.ts |
| Print sizes | ✅ print-preparation.service.ts |
| Region detection | ❌ Missing |
| Demo payment mode | ❌ Missing |
| Print order flow | ❌ Missing |
| Sharp tier generation | ❌ Missing |
| Package creditsIncluded > 0 | ❌ All 0 in prod |

## 13. Missing Features (P0)

1. Package `creditsIncluded` > 0 in production database
2. Demo payment mode implementation
3. `api.thannow.com` linked to Northflank port 8080
4. Cloudflare Pages `/api/*` proxy to Northflank

## 14. P4B Internal Worker — Northflank Deployment Readiness (2026-08-05, R9.2-PR125-MERGE-AND-P4B-READINESS)

PR #125 (R9.2-P4D MPGS verify+repair) merged: `5cf50447429aa2844e7b812446505f0c1c427999`.
The internal restoration worker runner (`apps/api/src/scripts/p4b-worker-runner-main.ts`,
`npm run worker:p4b`) is code-complete and fully tested (P4B/P4A/P3A
pg-race + non-DB suites all passing against a disposable local PostgreSQL
17) but **still not deployed as a Northflank service**. This packet added a
deployment runbook — `docs/deployment/P4B_WORKER_NORTHFLANK_RUNBOOK.md` —
covering the sole start command, required environment-variable names,
single-instance limits, health expectations, graceful shutdown, rollback,
and post-deployment checks. No runner code was changed and no Northflank
service, project, or secret group was created. Deploying it remains a
separate, explicitly authorized future task for the owner to perform
directly in the Northflank console using that runbook. See
`docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` section 13 and `rules.md`
for full evidence.
