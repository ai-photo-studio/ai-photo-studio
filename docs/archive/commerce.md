# Commerce Flow — Authoritative Frozen Specification

> **Status:** Frozen. Do not edit without board approval.
> **Source documents:** MASTER_PRICING_MODEL.md, MASTER_CUSTOMER_JOURNEY.md, docs_03-PRICING-PACKAGES.md, docs_07-PAYMENT-FLOW.md, PrintPipeline.md, commerce.md (v1 frozen), MASTER_PRODUCT_VISION.md, docs_01-MVP-SCOPE.md
> **Date:** 2026-07-27

---

## 1. Project Scope

Exactly **two services**:

1. **AI Product Photo Studio** — Upload product photos, background removal, product studio styles, bulk batch processing. Customers are ecommerce sellers, marketplace vendors, and vehicle dealers. Pricing via packages with credits.
2. **AI Old Photo Restoration** — Upload old/damaged photos, restore via Replicate, download HD resolutions, order prints. Pricing via per-image resolution tiers.

---

## 2. Markets

| | Pakistan | International |
|---|----------|---------------|
| Currency | PKR | USD |
| Payment | JazzCash, Easypaisa, manual bank transfer | Bank transfer, card gateway (future) |
| Delivery | Web download + WhatsApp notification | Web download |
| Printing | Local partners | Digital download only (future: international courier) |

---

## 3. Flow Diagram

```
Landing (/)
  ↓ Click "Try Free Background Removal" or "Start Restoration"
  ↓

/restore/new
  ↓ Upload image(s) — drag-drop or file picker
  ↓ Instant client-side metadata (no AI calls):
     Thumbnail, Filename, Size, W×H, Aspect Ratio, 
     DPI (assumed 300), Estimated Print Sizes, Format,
     Suggested Resolution
  ↓ Free preview generated (watermarked / limited resolution)
  ↓ User prompted to sign up for full download
  ↓

┌─── Registered user ─────────────────────────────────────────┐
│  ↓ Select style or restoration tier                          │
│  ↓ Credits deducted from wallet                               │
│  ↓ Queue → Process → Replicate → R2 → Download               │
│  ↓ Print order (optional: size, paper, frame, album, courier)│
└──────────────────────────────────────────────────────────────┘

┌─── Guest user ───────────────────────────────────────────────┐
│  ↓ Can upload, preview, create order                          │
│  ↓ Cannot download full resolution without signup             │
│  ↓ Limited to 1 free preview per session/day                  │
│  ↓ Prompted to register at download/payment step              │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Pricing — Product Photo Studio (Package Model)

### 4.1 Package Catalog

| Package | Price PKR | Credits | Includes | Best For |
|---------|-----------|---------|----------|----------|
| **Starter** | 1,499 | 10 | Background removal, White background, Transparent PNG, Basic retouch | New sellers, first-time users |
| **Pro** | 3,499 | 25 | Starter + Shadow enhancement, Resize variants, Priority queue | Active ecommerce sellers |
| **Business** | 6,999 | 60 | Pro + Product studio style, Batch support, Early access to premium styles | Brands, catalog teams |
| **Dealer** | 9,999 | 100 | Vehicle showroom, Road/studio scene, Plate blur, Bulk inventory | Vehicle dealers |

### 4.2 Credit Costs per Output

| Output Type | Credits | Notes |
|-------------|---------|-------|
| Free preview | 0 | Watermarked or limited resolution |
| Background removal final | 1 | White or transparent |
| Marketplace resize variant | 1 | May be bundled |
| Shadow enhancement | 2 | Cleaner product presentation |
| Flat lay scene | 3 | Future |
| Lifestyle scene | 4 | Future |
| Virtual model | 6 | Future |
| Product video | 10-20 | Future |

### 4.3 Credit Lifecycle

1. Customer receives credits: free, promotional, purchased, or subscription
2. Credits appear in wallet
3. Credits are **reserved** when paid processing starts
4. Credits are **settled** when processing completes successfully
5. Credits are **released** if processing fails
6. Admin can manually credit or refund

### 4.4 Free Trial

- Guest: 1 free preview per session/day
- New registered user: 3 free preview credits
- Free preview: watermarked or limited resolution
- Full-resolution download: requires credits

---

## 5. Pricing — Old Photo Restoration (Per-Image Tier Model)

### 5.1 Resolution Tiers

| Tier | PKR | USD | Output |
|------|-----|-----|--------|
| Original | 250 | 0.99 | As-restored master image |
| 2HD | 350 | 1.50 | 2× HD upscale |
| 4HD | 500 | 2.50 | 4× HD upscale |
| 6HD | 750 | 3.50 | 6× HD upscale |
| 8HD | 1,000 | 4.50 | 8× HD upscale |
| 10HD | 1,250 | 5.50 | 10× HD upscale |
| 12HD | 1,500 | 6.50 | 12× HD upscale |

### 5.2 Single Image

User selects one resolution tier. Price is tier × 1.

### 5.3 Multiple Images (Bulk)

| Bulk Package | Tiers Included | PKR (per image avg) |
|-------------|---------------|-------------------|
| Starter | Original, 2HD, 4HD | ~367 |
| Pro | Original, 2HD, 4HD, 6HD | ~463 |
| Business | Original, 2HD, 4HD, 6HD, 8HD | ~570 |
| Dealer | All 7 tiers | ~750 |

### 5.4 Upgrade Rule

If a customer purchases a lower tier and later upgrades:
- **Full price rule:** Customer pays the full price of the new tier (no discount for the previous purchase)
- Applies when upgrading resolution on the same image
- Applies when upgrading from single-image to bulk on the same order

---

## 6. Guest Flow

| Step | Behavior | When Login Required |
|------|----------|-------------------|
| Browse homepage | ✅ Allowed | Never |
| Upload image | ✅ Allowed (1 free preview/session) | Never |
| View preview | ✅ Watermarked/limited | Never |
| Create order | ✅ Allowed | Never |
| View metadata | ✅ Client-side only | Never |
| Download full-res | ❌ Blocked | ✅ Required |
| View order history | ❌ Blocked | ✅ Required |
| Purchase credits | ❌ Blocked | ✅ Required |
| Submit payment proof | ❌ Blocked | ✅ Required |

**Rule:** Guest and registered users follow identical upload/preview flow. Auth is required only for payment, download, and history.

---

## 7. Registered User Flow

| Step | Endpoint | Auth |
|------|----------|------|
| Register | POST /api/auth/register | Public |
| Login | POST /api/auth/login | Public |
| Browse packages | GET /api/packages | Public |
| Upload image | POST /api/restorations/:id/items | Required |
| Create order | POST /api/restorations | Required |
| View wallet | GET /api/wallet | Required |
| Create checkout | POST /api/orders/:orderNo/checkout | Required |
| Submit payment proof | POST /api/payments/manual-proof | Required |
| View order | GET /api/restorations/:id | Required |
| Download | POST /api/restorations/:id/items/:itemId/download | Required |
| View history | GET /api/restorations | Required |

---

## 8. Wallet & Credits

- Credits are stored in `Wallet` model
- Credits have source types: `FREE`, `PURCHASED`, `PROMOTIONAL`, `SUBSCRIPTION`
- Credits are reserved on job start, settled on completion, released on failure
- Wallet is created on first credit operation (lazy creation)
- Admin can credit/refund manually
- `creditsIncluded` on Package seeds the wallet after payment approval

**Code mapping:**
- `WalletService.getOrCreateWallet()` — lazy wallet creation
- `WalletService.creditWallet()` — add credits
- `WalletService.debitWallet()` — reserve/settle credits
- `WalletService.getBalance()` — current available credits
- `payment.service.ts:391` — credits granted on payment approval if `packageCredits > 0`

---

## 9. Print Flow

### 9.1 Print Sizes

| Size | Pixels (300 DPI) | mm |
|------|-----------------|-----|
| 4×6 | 1200×1800 | 102×152 |
| 5×7 | 1500×2100 | 127×178 |
| 8×10 | 2400×3000 | 203×254 |
| A4 | 2480×3508 | 210×297 |
| A3 | 3508×4961 | 297×420 |

### 9.2 Print Options (Not Yet Implemented)

| Option | Choices |
|--------|---------|
| Paper type | Matte, Gloss, Premium |
| Frame | None, Standard, Premium, Wood |
| Album | None, Standard, Premium |
| Courier | Standard, Express, Overnight |
| Shipping address | Full address collection |

### 9.3 Print Order Flow (Not Yet Implemented)

- Route: POST /api/prints (create print order)
- Route: GET /api/prints/:id (status)
- Route: POST /api/prints/:id/cancel (cancel)
- Validates print-ready image via `PrintReadinessService`

### 9.4 Code Mapping

- `PrintPreparationService` — upscale/sharpening/format conversion (exists)
- `PrintReadinessService` — quality validation wrapper (exists)
- Print sizes defined in `print-preparation.service.ts:19-75` (exists)
- Print order route/controller — NOT IMPLEMENTED
- Print order database model — CHECK (Prisma schema)

---

## 10. Replicate Pipeline

### 10.1 Steps (Phase 1)

1. `ReplicateProvider.execute()` — single call to `flux-kontext-apps/restore-image`
2. Result stored as `processedStorageKey` on the order

### 10.2 Steps (Frozen Spec — Phase 2+)

1. Call 1: `flux-kontext-apps/restore-image` (initial restoration)
2. Call 2: `flux-kontext-apps/restore-image` (detail enhancement)
3. Call 3: `flux-kontext-apps/restore-image` (final polish)
4. Result: master restored image stored in R2
5. `sharp` generates resolution tiers from master (no reprocessing)

### 10.3 Code Mapping

- `PipelineOrchestrator` — defines pipeline steps (exists)
- `ReplicateProvider` — calls Replicate API (exists)
- `REPLICATE_API_TOKEN` — in secret group (exists)
- `REPLICATE_RESTORATION_MODEL_SLUG` — `flux-kontext-apps/restore-image` (exists)
- Sharp tier generation — NOT IMPLEMENTED (Phase 2)
- Multiple sequential Replicate calls — NOT IMPLEMENTED (Phase 2)

---

## 11. Sharp Output Generation (Phase 2)

### 11.1 Flow

```
Replicate master image (R2 key)
  → Download from R2
  → sharp resize to each tier:
     - Original (as-is from Replicate)
     - 2HD (2048px long edge)
     - 4HD (4096px long edge)
     - 6HD (6144px long edge)
     - 8HD (8192px long edge)
     - 10HD (10240px long edge)
     - 12HD (12288px long edge)
  → Upload each tier to R2
  → Store tier keys on restoration item
```

### 11.2 Code Mapping

- `sharp` package — NOT in dependencies (must be added)
- `SharpTierService` — NOT IMPLEMENTED
- `generateTiers()` method — NOT IMPLEMENTED
- Tier download endpoint — NOT IMPLEMENTED

---

## 12. Payment Flow

### 12.1 Supported Providers

| Provider | Status | PaymentGatewayName |
|----------|--------|-------------------|
| Manual (proof upload + admin approval) | ✅ Implemented | `manual` |
| Demo (auto-approve) | 🔧 Planned | `demo` |
| JazzCash | ✅ Provider class exists, ❌ Not activated | `jazzcash` |
| Easypaisa | ✅ Provider class exists, ❌ Not activated | `easypaisa` |

### 12.2 Flow

1. Order created → `paymentStatus: PENDING`
2. Checkout requested → payment record created
3. Manual: customer submits proof → admin approves/rejects
4. Demo: auto-approved on creation
5. On approval: `payment.status = APPROVED`, `order.paymentStatus = PAID`, `order.orderStatus = PROCESSING`
6. Wallet credited (if `packageCredits > 0`)
7. Processing jobs enqueued

### 12.3 Code Mapping

- `PaymentProvider` interface (exists)
- `JazzCashPaymentProvider` (exists, not activated)
- `EasyPaisaPaymentProvider` (exists, not activated)
- `ManualPaymentProvider` (exists, active)
- `DemoPaymentProvider` — NOT IMPLEMENTED
- `payment.service.ts` — `finalizeApprovedPayment` (exists)
- `payment.service.ts` — `approvePaymentById` (exists)

---

## 13. Order Lifecycle

| # | Status | Description |
|---|--------|-------------|
| 1 | UPLOADED | Order created, images uploaded |
| 2 | REVIEW | Customer reviews metadata (client-side) |
| 3 | COMMERCE | Customer selects package/tier |
| 4 | PAYMENT_PENDING | Customer selected payment method |
| 5 | PAID | Payment confirmed |
| 6 | APPROVED | Payment approved (manual/auto) |
| 7 | PROCESSING | Replicate pipeline running |
| 8 | COMPLETED | Restoration finished, download ready |
| 9 | PRINTING | Print order placed (future) |
| 10 | SHIPPED | Physical shipment dispatched (future) |
| 11 | DELIVERED | Customer received order |

---

## 14. Code Mapping Summary

| Requirement | File(s) | Status |
|------------|---------|--------|
| Package model with credits | `prisma/schema.prisma:Package`, `env.ts`, `payment.service.ts` | ✅ Exists |
| Wallet/credit system | `WalletService`, `prisma.schema:Wallet` | ✅ Exists |
| Manual payment flow | `ManualPaymentProvider`, `payment.service.ts` | ✅ Exists |
| JazzCash/Easypaisa providers | `payment.providers.ts` | ✅ Exists (inactive) |
| Free preview | `PreviewController`, `previews/web` | ✅ Exists |
| Guest upload without auth | `restoration.controller.ts:addItem` (requires auth) | ⚠️ Auth-gated |
| Client-side metadata only | `RestoreNewPage.tsx` | ✅ Verified |
| No AI analysis in customer flow | All routes audited | ✅ Verified |
| Print sizes | `print-preparation.service.ts` | ✅ Exists |
| Print order flow | Route/controller | ❌ Missing |
| Sharp tier generation | `sharp` package + service | ❌ Missing |
| 3-step Replicate pipeline | `PipelineOrchestrator` | ❌ Phase 1 only |
| Demo payment mode | `payment.factory.ts`, `payment.providers.ts` | ❌ Missing |
| Resolution tier pricing | Database packages | ❌ Different model used |
| Print paper/frame/album/courier | UI + database | ❌ Missing |
| Package credits > 0 | Database `creditsIncluded` | ❌ All 0 |
| api.thannow.com SSL | Northflank Dashboard | ❌ Not linked |

---

## 15. Missing Features

| Feature | Priority | Effort | Depends On |
|---------|----------|--------|------------|
| Set package creditsIncluded > 0 | P0 | 0 code — database update | — |
| Demo payment mode (5 files, ~20 lines) | P0 | ~2 hours | — |
| Link api.thannow.com to Northflank port 8080 | P0 | Dashboard action | — |
| Cloudflare Pages proxy /api/* to Northflank | P1 | Dashboard action | — |
| Guest upload without auth | P1 | ~1 day | — |
| Sharp tier generation from master | P2 | ~3 days | Replicate pipeline |
| Print order route/controller | P2 | ~5 days | Print sizes (done) |
| 3-step Replicate pipeline | P2 | ~2 days | PipelineOrchestrator |
| Resolution tier pricing UI | P3 | ~5 days | — |
| Print paper/frame/album/courier UI | P3 | ~5 days | Print sizes (done) |

**Total missing: 10 features.** Of these, 3 are P0 (5-minute fixes) and the rest are Phase 2 enhancements.
