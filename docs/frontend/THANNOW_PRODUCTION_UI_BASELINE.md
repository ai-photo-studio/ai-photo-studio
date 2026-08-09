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

## Real local multi-process commerce harness (R9.5-P4B7/P4B7B: PKR_LOCAL_E2E_READY)

- Command: `npm run test:e2e:commerce-local` -- one process (`tsx
  scripts/test-commerce-local.ts`), no manual steps.
- Lifecycle, each started exactly once per run: `initdb`/`pg_ctl` disposable
  Postgres on an isolated loopback port -> `prisma migrate deploy` from empty
  -> real API (`RESTORATION_PROVIDER=mock`, `STORAGE_PROVIDER=mock`,
  `COMMERCE_E2E_TEST_MODE=true`) -> the mock-local P4B worker -> real Vite web
  -> a real Playwright browser (no `page.route` mocking of application APIs).
  Teardown (success or failure) tree-kills every child, stops Postgres, and
  deletes the disposable data/storage directories.
- **Windows process-tree note**: `ChildProcess.kill()` on a `.cmd`-launched
  process (`npx.cmd`) only kills that `cmd.exe` wrapper, not the real
  `tsx`/`vite` grandchild. Teardown uses `taskkill /PID <pid> /T /F` for a
  genuine tree-kill. (The originally-reported "repeated visible PowerShell
  window" symptom was unrelated to this file -- it came from manually
  reproducing the sequence via `Start-Process` across separate tool-shell
  invocations, each a new process with no lifetime link to the next.)
- **CORS**: `cors.middleware.ts`'s default allowlist only covers
  `localhost:5173`/`localhost:4000`. This harness's disposable, dynamically
  chosen `127.0.0.1` ports never match it, which silently blocks every
  browser-side `fetch` ("Failed to fetch", no server-side error at all) if
  `ALLOWED_ORIGINS` isn't set explicitly to the harness's own web origin --
  which the harness now does.
- The `<select>` locator regression that first surfaced this was actually the
  web process being spawned with the wrong `cwd` (repo root instead of
  `apps/web`, where `vite.config.ts`/`index.html` live) -- fixed.
- Network guard hard-fails only on Replicate/RunPod/Bank Alfalah/production-API
  hosts (all proven `0` in every passing run). Non-critical off-loopback
  requests (e.g. the app shell's static Facebook Pixel `<script>` in
  `index.html`, pre-existing and unrelated to commerce) are reported, not
  fatal.
- **Test-only checkout seam** (`customer-checkout-test.service.ts` +
  controller, mounted only when `NODE_ENV != production &&
  COMMERCE_E2E_TEST_MODE === "true"` -- structurally absent, not just
  refused, otherwise): mirrors `CustomerCheckoutService.createCheckout`'s real
  ownership/pricing/idempotency checks but never touches
  `bankAlfalahMpgs.enabled` or calls Bank Alfalah. `completeTestPayment` is
  the sole, triple-guarded HTTP-reachable caller of `commerce-e2e-payment.ts`'s
  `verifyTestPayment`.
- **Server-authoritative test-mode signal**: `GET /api/e2e/test-mode` (same
  mount guard) is the only thing `FixedOrderReviewPage` trusts to show the
  "Complete TEST Payment" button -- never the client's own Vite build env.
  Production: 404, button absent, production redirect path (`Pay & Restore
  Photo` -> live Bank Alfalah) unchanged.
- **FixedOrder restoration status/download**
  (`fixed-order-restoration-status.service.ts` + controller, GET-only,
  ownership-gated via `assertOwnership`, uniform not-found for wrong-owner/
  nonexistent): this flow had zero HTTP surface for checking processing state
  or getting a download before this packet. A signed download URL is only
  ever returned once `RestorationMaster.status === "VALIDATED"` with a
  `storageKey` present; refresh/poll never triggers processing (read-only).
- **Mock-mode P3A**: `ReplicateExecutionWorker`'s provider guard was widened
  from `=== "replicate"` to `"replicate" | "mock"` (`replicate-execution.worker.ts`).
  Production topology is unaffected: `p4b-worker-runner-main.ts` (the only
  production caller) still refuses to start unless `RESTORATION_PROVIDER ===
  "replicate"`, so this worker can never be constructed with `"mock"` in a
  real deployment. `p4b-worker-runner-mock-local.ts` is the only process that
  ever supplies `"mock"`, and it has its own triple guard
  (non-production/explicit test flag/`RESTORATION_PROVIDER=mock`).
- **Mock storage across process boundaries**: `MockStorageProvider` was
  pure in-memory-per-process (invisible across the API/worker process
  boundary). `MOCK_STORAGE_DIR`, set only by this harness, additionally
  persists to disk so multiple mock-mode processes share state; unset (every
  existing unit test's environment), behavior is unchanged.
- Full PKR digital proof, this harness, real browser: Home -> upload once ->
  Preview -> Digital tier select (2x HD, PKR 1,000.00, PriceBook
  `PB-2026-08-09-TRIAL-V3`) -> Review -> Complete TEST Payment -> real P4A ->
  real mock P4B worker -> real P3A -> `SUCCEEDED`/`VALIDATED` -> download
  link. Exactly 1 row each of FixedOrder/PaymentAttempt/
  RestorationEntitlement/RestorationMaster/ReplicateExecution; duplicate
  `test-checkout/complete` calls and repeated status polls create zero
  additional rows.
