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

- ThanNow has ONE customer restoration upload entry flow. All Upload Photo /
  restoration-start CTAs and `/restore/new` resolve to the canonical Upload Your
  Photo experience. No CTA may directly resurrect the legacy upload page.

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

## Canonical Pakistan paid restoration flow (R9.5-P4B9: 2026-08-09)

- **One customer upload authority:** every one of the 14 restoration-start CTA
  sites, `/restore/new`, `/restore-mvp/new`, pricing starts, and re-upload
  actions resolve to the existing `Upload Your Photo` modal. It performs one
  explicit `POST /api/restoration-drafts`, persists guest ownership and the
  draft id, then navigates directly to persisted Preview. The historical
  `RestoreNewPage` (`Upload Photos for Restoration`) remains source-only and
  unrouted; the direct legacy `/restorations/:id/items/:itemId/process` route
  is removed.
- **One Pakistan commerce journey:** upload once -> Preview -> Restore &
  Download or Print + Digital - Home Delivery -> one V3 quality -> immutable
  server-priced Review -> 100% verified advance payment -> P4A -> P4B -> P3A
  -> canonical FixedOrder status -> download. Print reuses the same validated
  restoration master and never creates a second AI execution.
- **Advance-payment invariant:** CREATED/PENDING/FAILED/CANCELLED/EXPIRED and
  forged browser query state create zero `ReplicateExecution` rows. Only a
  verified `PaymentEvent` matching the immutable server amount/currency can
  mark `PaymentAttempt.PAID` and enqueue the first execution. Duplicate and
  concurrent verified evidence converge to one event/entitlement/master/
  execution. GET/refresh/poll routes never create or claim work.
- **Review and print:** Review shows product, quality, server-owned digital
  amount, print subtotal, delivery, total, and address. Pakistan print uses
  `PRINT-CATALOG-2026-08-09-TRIAL-V2`. After payment and master validation,
  concurrent print preparation converges to one `PrintEntitlement.PREPAID`
  and one `FulfilmentOrder.PENDING`; shipment count remains zero and the
  truthful blocker is `PRINT_PARTNER_ASSIGNMENT_REQUIRED`.
- **Processing investigation:** the current full-stack reproduction does not
  stick. Both orders transition PAID/verified -> GRANTED -> VALIDATED ->
  SUCCEEDED, the worker has a non-null `startedAt`, and the browser polls only
  `GET /api/fixed-orders/:orderNo/restoration-status`. The previously observed
  symptom was `WORKER_NOT_RUNNING`: manually spawned worker grandchildren did
  not survive separate shell-process lifetimes. The one-command harness owns
  API/web/worker lifetimes and tree teardown, which is the established fix.
- **Real local proof:** `npm run test:e2e:commerce-local` now drives both
  Digital 2x HD (PKR 1,000) and Print+Digital 4x/4x6 quantity 10 (PKR 2,750 =
  1,500 digital + 1,000 print + 250 delivery) from the homepage modal. Final
  disposable DB counts are 2 drafts/orders/items/payment attempts/verified
  payment events/entitlements/masters/executions; 1 address/print entitlement/
  fulfilment order; 0 shipments. Replicate/RunPod/Bank/production calls,
  predictions, and real charges are all zero.
- **Verification:** browser 101/101; responsive 91/91; FixedOrder 16/16, P4A
  14/14, P4B 10/10, P3A 10/10, print fulfilment 1/1 PostgreSQL suites; empty
  23-migration deploy, second deploy, and status clean; lint has only the 91
  pre-existing warnings; typecheck/build/Prisma validate/generate pass.
- Evidence-based completion: frontend 100%, Pakistan funnel 100%, processing
  100%, internal print 100%, internal commercial 100%. Live payment integration
  is 50% and full Pakistan commercial readiness is 80% because Bank activation
  and real print-partner assignment remain external launch blockers.
- Protected scope held: no production database, deploy, push, real payment,
  Replicate call, RunPod call, Bank call, or production routing change.

## Historical asset retention (R9.5-P4B10: 2026-08-09)

- `old images/` is retained as historical/reference evidence and must not be
  deleted without explicit owner authorization. It is not wired into the
  active frontend or processing runtime.
- `price book/prices.xlsx` is retained as local historical workbook evidence
  and remains ignored, alongside `prices.xlsx` and `prices(1).xlsx`; it is not
  an API or runtime price source.
- Restoring archived PriceBook/reference material never reactivates obsolete
  catalogs. `PB-2026-08-09-TRIAL-V3` remains the sole current customer-facing
  PriceBook authority. Deleting either historical folder requires explicit
  owner authorization.

## Production parity and release candidate (R9.5-P4B11: 2026-08-09)

- **Parity finding:** local candidate is `cee6ea250ac71a865a1cf837215ac5a6bfb5c7b6`.
  The tracked remote branch still points to `37c317a`, so commits `6bd50ff`,
  `942cc2f`, and `cee6ea2` are not proven deployed. The live Cloudflare Pages
  HTML serves `/assets/index-D6CznrWT.js`; its bundle contains `Upload Photos
  for Restoration`, `Demo Payment Mode`, `/restore/new`, and stale `250`, but
  contains neither `PB-2026-08-09-TRIAL-V3` nor `Print + Digital`. This proves
  `FRONTEND_NOT_DEPLOYED`, not a browser-cache-only defect.
- **API parity:** `GET https://api.thannow.com/api/health` reports
  `build_sha=dd8924a78f54487ab9336806b3906b4c585a5860`, `provider=replicate`,
  and `payment_mode=manual`. Its Pakistan digital catalog endpoint returns
  404, proving the deployed API is also not the P4B9 candidate. The result is
  `API_NOT_DEPLOYED` plus `MIXED_FRONTEND_API_VERSIONS`; no production DB was
  mutated.
- **Candidate deploy package:** deploy the exact Git commit
  `cee6ea250ac71a865a1cf837215ac5a6bfb5c7b6` to Cloudflare Pages project
  `ai-photo-studio-whatsapp-web` and the API service through the approved
  Northflank main-branch release process. Do not deploy from the stale
  `37c317a` branch or from a dirty worktree.
- **Rollback package:** retain the currently live Cloudflare deployment
  identified by asset `index-D6CznrWT.js` and the currently live API revision
  identified by `BUILD_SHA=dd8924a78f54487ab9336806b3906b4c585a5860` in the
  platform consoles. Roll back platform revisions, not database state; do not
  infer a Git SHA from the API build SHA until the release system records that
  mapping.
- **Candidate acceptance:** local browser 102/102 and responsive 92/92 tests,
  the canonical 14-CTA matrix, Pakistan Digital and Print+Digital real local
  E2E, V3 price tests, and all payment/processing/print race suites pass.
  Candidate screenshots were not captured because no repository screenshot
  capture workflow is available; production was not changed.

## Pakistan launch gates (R9.5-P5A: 2026-08-09)

- **Bank Alfalah:** `BANK_ACTION_REQUIRED`. The canonical MPGS integration is
  disabled by default and fail-closed. The latest sanitized sandbox evidence
  is Hosted Checkout HTTP 404 on the v74 initialization path, not a proven
  local authentication defect. The owner must obtain from Bank Alfalah the
  exact provisioned Merchant ID, correct sandbox host/region, REST API Password
  (not portal/operator password), Hosted Checkout/API enablement, supported API
  version/path, and a sanitized request/response or correlation-ID contract.
  No secret was read, echoed, guessed, or tested here.
- **Print operations:** code is `READY_FOR_PARTNER_DATA`: paid + validated
  order, address, print snapshot, and the same RestorationMaster are required
  before the idempotent boundary creates one `PrintEntitlement` and one
  `FulfilmentOrder.PENDING`. No partner assignment seam currently exists. Once
  real partner data is supplied, an authorized operations actor must assign
  partner ID/name/service area/contact reference/supported sizes/active state,
  verify the address and catalog specification, record the assignment audit,
  and only then dispatch through the real partner process. No tracking,
  shipment, dispatched, or delivered state may be fabricated.
- **Migration preflight:** before any API deployment, run `DATABASE_URL=<local
  or approved target> npx prisma migrate status`; candidate migrations beyond
  the original baseline are `20260802183254_r92_p0a_fixed_order_foundation`,
  `20260803000000_r92_p1a_fixed_order_source_draft_unique`,
  `20260803010000_r92_p1b_fixed_order_item_pricing_provenance`,
  `20260803020000_r92_p1c_b_fixed_order_pricebook_snapshot`,
  `20260808000000_r95_p4b_pricebook_v2_tiers`, and
  `20260809000000_r95_p4b4_print_delivery_address`. Apply migrations in
  repository order, rerun status, then perform API smoke. Never use production
  DB credentials in local verification and never roll back schema destructively.
- **Release order:** API first at candidate commit
  `13d792a4b49248b0e70d47ba80ae11516237850b`; verify health, V3 catalog,
  print catalog, `POST /api/restoration-drafts` support, and
  `GET /api/fixed-orders/:orderNo/restoration-status`. Only after those pass,
  deploy the same candidate frontend to Cloudflare Pages and run live browser
  smoke: modal upload once, Preview, seven tiers, Digital/Print+Digital,
  server total, no PKR 250, no Demo Payment Mode, no legacy upload page,
  completed FixedOrder result/download, and pending print fulfilment.
- **Rollback:** frontend rollback is the currently deployed Cloudflare Pages
  deployment serving `index-D6CznrWT.js`; API rollback is the currently serving
  platform revision reporting `BUILD_SHA=dd8924a78f54487ab9336806b3906b4c585a5860`.
  Roll back API/frontend as platform revisions in reverse release order, keep
  Replicate as the provider, preserve payment fail-closed behavior, and do not
  mutate or reverse database migrations automatically.
- **Protected scope:** no deployment, push, production DB mutation, real
  payment, real Replicate call, RunPod action, Bank credential access, or print
  partner invention occurred. Current evidence remains browser 102/102,
  responsive 92/92, Pakistan Digital and Print+Digital E2E passed, and all
  five PostgreSQL race suites passed individually. Bank config/gateway tests
  passed 13/13 and 28/28; the existing Vitest diagnostic could not be invoked
  because `vitest` is absent from installed dependencies and the API workspace
  has no unit-test script.

## Safe production release lineage (R9.5-P5B: 2026-08-09)

- Release branch: `release/r9.5-pakistan`, created from `origin/main`
  `dd8924a78f54487ab9336806b3906b4c585a5860`.
- Integration: `git merge --no-ff 653d240`; no conflicts, blanket ours/theirs
  resolution, reset, rebase, force push, or main rewrite. Release HEAD after
  the verification documentation commit is `5f5e3c09742a1848ea17753d91edd1cfd8920080`.
- Both lineage proofs pass: `origin/main` is an ancestor of the release branch
  and candidate `653d240` is an ancestor of the release branch. The release
  branch contains the verified canonical upload/Pakistan commerce behavior and
  preserves unrelated current main history.
- Migration delta calculated against `origin/main`: exactly
  `20260808000000_r95_p4b_pricebook_v2_tiers` (four additive `DigitalTier`
  enum values) and `20260809000000_r95_p4b4_print_delivery_address` (new
  address table, unique fixed-order index, and foreign key). Both are
  `ADDITIVE`; no `DROP`, destructive rewrite, or data backfill exists.
- Disposable release-schema proof: all 23 migrations applied from empty;
  second `prisma migrate deploy` reported no pending migrations;
  `prisma migrate status` reported up to date. FixedOrder, V3 tiers/payment,
  P4A/P4B/P3A, and print fulfilment tests passed on that schema.
- Production mechanism finding: `Dockerfile` sets `SKIP_MIGRATIONS=true` and
  does not run migrations. Repository deployment workflow builds/deploys the
  API but has no production migration step. The documented procedure says
  migrations run separately, but no approved Northflank job/command or
  production `DATABASE_URL` is available in this workspace.
- Required owner action before API deploy: provide the approved read-only
  production migration-status mechanism/credential, confirm production is
  ready for the two additive migrations, then apply only those migrations via
  the approved operator path. Never use `db push`, reset, destructive SQL, or
  an unreviewed startup migration.
- Future release order remains: migration status/apply -> API release and
  `/api/health`, V3 catalog, print catalog, draft support, and FixedOrder
  status smoke -> same-lineage frontend release -> live customer smoke.
  Current rollback references remain Cloudflare deployment
  `72cdd2d7-7334-4f36-80bb-bb6f5a33226c` / source `4965032` and API
  `BUILD_SHA=dd8924a78f54487ab9336806b3906b4c585a5860`.
