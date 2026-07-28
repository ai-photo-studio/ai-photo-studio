# Commerce Flow — Authoritative Document (Frozen)

## Project Scope

This project handles exactly two services:

1. **AI Old Photo Restoration** — Upload old/damaged photos, instant metadata review, commerce selection, payment, restoration via Replicate, download, print
2. **Printing Services** — Photo prints of restored images in various sizes, paper types, frames, albums, shipped via courier

All other features have been archived or removed.

---

## Markets

| | Pakistan | International |
|---|----------|---------------|
| Currency | PKR | USD |
| Payment | Bank Alfalah | Bank Alfalah USD (or documented alternative) |
| Delivery | Pakistan Post | DHL, FedEx, UPS, digital |
| Printing | Local partners | International partners or digital |

---

## Flow Diagram

```
Landing (/)
  ↓ Click "Start Restoration"
  ↓
/restore/new
  ↓ Select/drag-drop image(s)
  ↓ Click "Upload N image(s)"
  ↓
POST /api/restorations → 201 Created
  ↓
POST /api/restorations/:id/items × N → 201 Created (one per image)
  ↓
Instant metadata (client-side, no AI calls):
  Thumbnail, Filename, File Size, Width × Height,
  Aspect Ratio, DPI, Estimated Print Sizes, Orientation,
  Image Format, Suggested Restoration Resolution
  ↓
Preview Step (shows all images with metadata)
  ↓ User clicks "Continue"
  ↓

  ┌─── IF single image (files.length === 1) ──────────────────┐
  │  Resolution Selection                                       │
  │  ├── Original (PKR 250 / USD 0.99)                          │
  │  ├── 2HD (PKR 350 / USD 1.50)                               │
  │  └── 4HD (PKR 500 / USD 2.50)                               │
  └─────────────────────────────────────────────────────────────┘

  ┌─── IF multiple images (files.length > 1) ───────────────────┐
  │  Bulk Package Selection                                     │
  │  ├── Starter (Original, 2HD, 4HD)                           │
  │  ├── Pro (Original, 2HD, 4HD, 6HD)                          │
  │  ├── Business (Original, 2HD, 4HD, 6HD, 8HD)               │
  │  └── Dealer (Original, 2HD, 4HD, 6HD, 8HD, 10HD, 12HD)    │
  └─────────────────────────────────────────────────────────────┘

  ↓
Payment Method Selection
  ├── Bank Alfalah (PKR — domestic)
  ├── Bank Alfalah (USD — international)
  └── JazzCash (via Bank Alfalah, no separate provider)
  ↓
Payment Confirmation
  │  Processing NEVER begins until payment is approved
  ↓
POST /api/restorations/:id/items/:id/process
  │  Payment guard: order.status === APPROVED | COMPLETED
  │  If not approved → HTTP 402 PAYMENT_REQUIRED
  ↓
PipelineOrchestrator.execute ("replicate" tier)
  │  ReplicatePipelineProvider
  │  3 sequential Replicate API calls (FLUX Restore model)
  │  No RunPod (disabled by ProviderPolicyEngine)
  │  All resolutions from stored master image (no reprocessing)
  ↓
/restore/:orderId
  │  Polls every 7s for status
  │  Shows: status, preview, download tiers, print options
  ↓
Download
  │  Original, 2HD, 4HD, 6HD, 8HD, 10HD, 12HD (from master)
  ↓
Print Options
  ├── Photo Size (4x6, 5x7, 8x10, A4, A3, Album)
  ├── Paper Type (matte, gloss, premium)
  ├── Frame (none, standard, premium, wood)
  ├── Album (standard, premium)
  ├── Courier (standard, express, overnight)
  └── Shipping address
  ↓
Invoice
  ↓
Order Complete
```

---

## Key Rules

1. **No AI analysis in customer flow.** Image analysis (quality scores, damage scoring, face detection) is removed from the customer journey. Only instant client-side metadata is shown.

2. **No processing before payment.** The ONLY actions before payment are: Upload, Instant Metadata Review, Commerce Selection, Order Creation. Processing (Replicate) starts only after payment is approved.

3. **Single source of upload truth.** All uploads go through `/restore/new` → `RestoreNewPage.tsx`. No other upload entry points exist.

4. **One payment provider.** Bank Alfalah handles all payments, including JazzCash collections.

5. **Guest and logged-in users follow identical flow.** Authentication only affects payment/account access, not the upload/metadata/commerce workflow.

6. **No RunPod.** RunPod is disabled by `ProviderPolicyEngine`. Replicate is the only active AI provider.

7. **The state machine has exactly one path:** Upload → Metadata Review → Commerce → Payment → Processing → Download → Print. No alternate flows, no redirects, no duplicate UI.

---

## Pricing (Resolution Tiers)

| Resolution | PKR | USD |
|------------|-----|-----|
| Original | 250 | 0.99 |
| 2HD | 350 | 1.50 |
| 4HD | 500 | 2.50 |
| 6HD | 750 | 3.50 |
| 8HD | 1,000 | 4.50 |
| 10HD | 1,250 | 5.50 |
| 12HD | 1,500 | 6.50 |

---

## Order Lifecycle

1. **UPLOADED** — Order created, images uploaded
2. **REVIEW** — Customer reviews metadata
3. **COMMERCE** — Customer selects resolution or package
4. **PAYMENT_PENDING** — Customer selected payment method
5. **PAID** — Payment confirmed
6. **APPROVED** — Payment approved (manual or automatic)
7. **PROCESSING** — Replicate pipeline running
8. **COMPLETED** — Restoration finished, download ready
9. **PRINTING** — Print order placed
10. **SHIPPED** — Physical shipment dispatched
11. **DELIVERED** — Customer received order

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/restorations` | Create restoration order |
| POST | `/api/restorations/:id/items` | Upload image to order |
| POST | `/api/restorations/:id/items/:id/quality-analysis` | Backend-only (admin/verification) |
| GET | `/api/restorations/:id` | Get order status |
| POST | `/api/restorations/:id/items/:id/preview` | Generate preview |
| POST | `/api/restorations/:id/items/:id/process` | Start processing (gated by payment) |
| POST | `/api/restorations/:id/items/:id/download` | Get download URL |
| POST | `/api/restorations/:id/items/:id/approve` | Approve/reject item |

---

## Pages

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | HomePage | Marketing, redirect to `/restore/new` |
| `/restore/new` | RestoreNewPage | Upload + Metadata + Commerce + Payment |
| `/restore/:orderId` | RestoreOrderPage | Status + Download + Print |
| `/restore` | RestorationHistoryPage | Past orders |
| `/login` | LoginPage | Authentication |
| `/register` | SignupPage | Registration |
| `/pricing` | PricingPage | Package listing |
| `/account` | AccountPage | Redirect to `/orders` |
| `/orders` | OrdersPage | Wallet + Credits |
| `/wallet` | WalletPage | Balance |
| `/payments` | PaymentsPage | History |

---

## No-Customer-Facing AI Analysis (OPS-151)

The customer-facing flow NO LONGER calls:
- Quality-analysis API
- Face detection API
- Damage scoring
- Quality scoring

Instead, the preview step computes the following **client-side only**:
- Thumbnail (from base64 data URL)
- File name
- File size
- Width × Height (from `new Image()` browser API)
- Aspect ratio
- DPI (assumed 300 for print estimates)
- Estimated print sizes
- Orientation (from dimensions)
- Image format (from MIME type)
- Suggested restoration resolution (Original/2HD/4HD based on pixel dimensions)
- Print-ready indicator (width ≥ 1800 && height ≥ 1800)

---

## Regression Protection

6 scripts maintain the flow integrity:
- `check_payment_gate.ps1` — requires APPROVED/COMPLETED before processing
- `check_single_vs_bulk.ps1` — single=resolution, multi=packages
- `check_provider_selection.ps1` — RunPod disabled, Replicate default
- `check_dynamic_commerce_flow.ps1` — isSingle branching logic
- `end_to_end_flow.ps1` — 35 comprehensive checks
