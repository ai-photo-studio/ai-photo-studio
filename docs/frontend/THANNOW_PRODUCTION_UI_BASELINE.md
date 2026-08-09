# ThanNow Production UI Baseline

Status: locked

## Source of truth

- Frontend visual source of truth: `646f27b565aa7b9fb7baa6a781f8656ccf8c2662`
- Locked production deployment: `44595069-4841-4ea6-bd72-4acd523fd353`
- Locked production URL: `https://www.thannow.com`

## Permanent distinction

- Backend source of truth: current canonical `origin/main` APIs and customer
  flow.
- Frontend visual source of truth: the locked production presentation above.
- Newer backend/main changes do not automatically replace approved frontend
  presentation.

## Protected presentation scope

These frontend presentation files are protected against silent regression:

- `apps/web/src/pages/HomePage.tsx`
- `apps/web/src/components/PublicLayout.tsx`
- `apps/web/src/components/CustomerLayout.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/App.tsx`
- `apps/web/src/data/heroes.ts`
- `apps/web/src/components/HeroCompareSlider.tsx`
- `apps/web/public/assets/hero/hero/**`

## Approved structural signature

- Brand: `ThanNow`
- Homepage CTA text: `Upload Photo and View Pricing`
- Approved hero: Premium Hero V2, one frame, Then left / Now right, horizontal
  handle, random first selection, ~7 second rotation, pause on interaction
- Approved homepage structure: hero + memories + upscale + printing + how it
  works + pricing + final upload block + upload modal
- Approved navigation signature: public header links to Home, Restoration,
  Upscaling, Printing, How It Works, Pricing, plus Login / Sign Up / Get
  Started

## Regression rule

Any future frontend presentation change must be owner-requested and must ship
with updated screenshots, validator updates, and protocol updates. The older
generic UI and any older home-page composition remain rejected.

## Recovery evidence

- Recovery branch: `fix/r9.5-restore-known-good-ui`
- Recovered source commit: recorded by the P3D recovery commit
- Candidate screenshots:
  - `D:/Temp/kilo/r95-p3d-recovered-candidate/desktop-1440.png`
  - `D:/Temp/kilo/r95-p3d-recovered-candidate/mobile-390.png`
  - `D:/Temp/kilo/r95-p3d-recovered-candidate/desktop-1024.png`
  - `D:/Temp/kilo/r95-p3d-recovered-candidate/mobile-430.png`
- Direct image comparison is unavailable in the agent environment; human
  visual approval is required before any future deployment.
- Recovery preserved current App route additions and customer-flow pages while
  restoring only the locked presentation shell, homepage composition, style
  system, and locked hero registry/assets.

## Current recovered production implementation

- Owner human visual approval: confirmed before this deployment packet.
- Recovered source: `4965032ce1305e78261b9702ec77b8ba44f63607`
- Current production deployment:
  `72cdd2d7-7334-4f36-80bb-bb6f5a33226c`
- Current production URL: `https://www.thannow.com`
- Previous rollback target retained:
  `44595069-4841-4ea6-bd72-4acd523fd353`
- Live structural verification passed at 1440, 1024, 430 and 390 widths:
  locked sections/navigation/CTA, matched Hero pairs, zero overflow, no
  runtime/request failures, protected-route redirect, and read-only Print.

## Restoration customer funnel rule

- Homepage upload creates the authoritative server-backed `RestorationDraft`
  exactly once and navigates directly to its persisted preview.
- Preview and refresh are GET-only; the customer is never asked to upload the
  same image again.
- Product and quality are selected together. Digital Download can proceed with
  server PriceBook offers; Print + Digital remains visible but blocked as
  `PRINT_CATALOG_REQUIRED` until an authoritative catalog, delivery price, and
  fulfilment checkout exist.
- Checkout uses the immutable `FixedOrder`. Production payment remains
  fail-closed and restoration cannot start before server-verified payment.
- Production demo-paid controls are prohibited. The legacy `/restore/new`
  workflow is not the homepage funnel authority.
- P4A candidate screenshots are stored under
  `D:/Temp/kilo/r95-p4a-funnel-candidate/` for human review before any future
  deployment.

## Pre-production commerce reset (2026-08-09)

- Sole current trial PriceBook: `PB-2026-08-09-TRIAL-V3`; PKR and USD values
  are independently authored and automatic FX is disabled.
- Current print catalog: `PRINT-CATALOG-2026-08-09-TRIAL-V2`; international
  print checkout fails closed as `INTERNATIONAL_PRINT_SHIPPING_REQUIRED` until
  destination rates exist.
- Print + Digital delivery address is stored in the additive
  `PrintDeliveryAddress` model. Paid fulfilment remains operationally pending;
  no shipment or tracking state is fabricated.
- Memory packages expose PKR and USD trial catalog values. Packages with
  incomplete fulfilment details remain `checkoutReady=false` with
  `PACKAGE_FULFILMENT_DETAILS_REQUIRED`.
- The first real commercial payment will restore immutable historical pricing;
  this reset is pre-production only and no production database was modified.
- Evidence: 23-migration disposable PostgreSQL deploy/status proof, PriceBook
  and print catalog tests, FixedOrder/P4A/P4B/P3A race suites individually,
  full browser `91/91`, responsive `89/89`, and screenshots under
  `D:/Temp/kilo/r95-p4b4-commerce-screens/`.

## Trial reset and print fulfilment boundary (2026-08-09)

- Operator command: `npx tsx src/scripts/trial-commerce-reset.ts` from
  `apps/api`; default is dry-run. `--apply` is required for writes.
- Reset refuses non-loopback/managed database hosts, aborts on paid or verified
  evidence, uses one transaction, never calls a provider, and is idempotent.
- Eligible unpaid trial orders update only to
  `PB-2026-08-09-TRIAL-V3`; totals/items and safe unpaid PaymentAttempt amounts
  are recomputed server-side. No PaymentEvent, entitlement, master, execution,
  print entitlement, fulfilment order, or shipment is created.
- Print fulfilment preparation requires paid FixedOrder, validated master,
  valid print snapshot, and `PrintDeliveryAddress`. It creates at most one
  `PrintEntitlement` and pending `FulfilmentOrder`; partner assignment remains
  `PRINT_PARTNER_ASSIGNMENT_REQUIRED` and no tracking/shipped state is faked.
- International print remains blocked as
  `INTERNATIONAL_PRINT_SHIPPING_REQUIRED` without destination-specific rates.

## Zero-cost local commerce E2E boundary (2026-08-09)

- Restoration mock selection is `RESTORATION_PROVIDER=mock` and is refused by
  the production P4B worker runner; production remains Replicate-only.
- The explicit local test payment seam is
  `apps/api/src/scripts/commerce-e2e-payment.ts`. It requires
  `COMMERCE_E2E_TEST_MODE=true`, `RESTORATION_PROVIDER=mock`, and refuses
  `NODE_ENV=production`. It calls the normal P4A verified-evidence contract;
  it does not create a production route or accept query-string payment state.
- The seam has no Replicate, RunPod, Bank Alfalah, or Mastercard host and uses
  no card data. Its safety tests prove production refusal and zero external
  payment/provider hosts.
- Existing P4A/P4B/P3A mock-port tests prove the real entitlement, master,
  execution, claim, validation, and download orchestration without external
  compute. A full browser/API multi-process E2E remains a separate harness
  packet; no production bypass is introduced here.
