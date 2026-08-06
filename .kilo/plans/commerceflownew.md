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

## 15. R9.2-P5B — Deterministic Sharp Digital Variants (2026-08-05)

`SharpVariantService` (`apps/api/src/services/sharp-variant.service.ts`)
generates server-owned `original`/`2hd`/`4hd` digital variants from a
validated `RestorationMaster`. P5B unit 3/3, P5B PostgreSQL race 3/3, full
P3A/P4A/P4B/P5A regression all passing. No schema/migration/payment/
Replicate/RunPod/deployment change. See
`docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` section 14 and
`docs/restoration/P5B_SHARP_VARIANT_PROTOCOL.md`.

## 16. R9.2-RESOLVE-P127-MERGE-AND-RETIRE-DUPLICATE-DOCS — PR #127 merged; documentation authority consolidated (2026-08-05)

- **PR #127 merged**: `feat/r9.2-p5b-sharp-variants` merged into `main`,
  merge commit `738fe3c3779c5462bad61a5ea2437704aa0216fe`, after resolving
  pure documentation-numbering drift against `origin/main` (PR #126) in an
  isolated resolver worktree. Full record:
  `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` section 15.
- **Retired-file list (deleted, must not be recreated)**: `AGENTS.md`,
  `docs/PROJECT_STATE.md`, `docs/NEXT_TASK.md`, `docs/PROTECTED_SCOPE.md`,
  `docs/COMPLETION_STATUS.md`, `docs/DECISIONS.md`, `reports/LATEST.md`.
- **Final documentation authority**: `rules.md`, this plan
  (`.kilo/plans/commerceflownew.md`), `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md`
  (canonical, append-only release evidence), feature-specific protocol
  documents already tracked under `docs/`, and `AI_code_audit_report_RI.md`
  as ignored local audit history (required after every task; never staged
  or committed).
- **Protected Scope Protocol**: canonical source, workflows, packets,
  validators, migrations, tests, and development documentation remain
  tracked; no `.gitignore` broadening beyond the existing
  `AI_code_audit_report_RI.md` entry; no `git add -f`; no replacement
  status/automation file of the retired shape may be created; historical
  references to a retired file inside an existing append-only evidence
  document are left intact as historical record.
- **Completion percentage (this documentation-consolidation scope)**:
  100% — PR #127 merged, all 7 target files deleted, zero active tracked
  references remain, lint/typecheck/build/Prisma validate all pass, P5B
  focused unit tests pass, `git diff` checks clean, zero live external
  calls made.

## 17. R9.2-P6A — PriceBook reconciliation (2026-08-05)

- **Verified, not changed**: the owner-approved PriceBook `PB-2026-08-03-v1`
  in `apps/api/src/domain/pricing/priceBook.ts` matches the approved amounts
  exactly — PKR ORIGINAL/2HD/4HD `25000`/`35000`/`50000` minor units, USD
  ORIGINAL/2HD/4HD `150`/`250`/`350` minor units — confirmed both by direct
  source read and by the passing `priceBook.test.ts` ("real APPROVED_PRICE_BOOKS
  shape (1 version, 6 entries, automaticFxAllowed:false)"). The migration
  `20260803020000_r92_p1c_b_fixed_order_pricebook_snapshot` exists and is
  applied. No price or PriceBook behavior was changed by this packet.
- **Stale current documentation corrected**: the `FixtureOfferProvider`
  header comment in `apps/api/src/domain/pricing/offerProvider.ts` stated,
  in the present tense, that "NO [USD] fixture exists" and that USD pricing
  was an unresolved owner-approval blocker. That was accurate when P1A was
  written but is stale now that `PB-2026-08-03-v1` (P1C-B) approved real USD
  pricing. The original P1A text was preserved verbatim (it is a correct
  dated historical record); a dated update note was appended directly below
  it pointing to `ApprovedOfferProvider`/`priceBook.ts` as the current,
  correct provider for both markets. No other file changed a substantive
  pricing claim.
- **Note on this plan's own frozen text**: section 5 above ("USD is derived
  from PKR base pricing... No separate USD-only packages exist") is part of
  this document's frozen (2026-07-28, "do not edit without board approval")
  original business specification and was left untouched, per this
  document's own freeze notice and this task's "preserve dated historical
  statements unchanged" instruction. For the record: the actual owner-
  approved PriceBook USD entries are independently set, fixed minor-unit
  values (`automaticFxAllowed: false` at the type level) — **not**
  FX-derived from the PKR base — which supersedes that frozen line as a
  statement of current pricing mechanism, without editing it.
- **Wiring note (unchanged by this packet)**: neither `FixtureOfferProvider`
  nor `ApprovedOfferProvider` is imported by any live service, controller,
  or route in this repository today — the digital-tier pricing/offer layer
  remains domain-logic-only, not yet wired into a customer-facing order
  flow. This packet did not wire it in and did not create any checkout
  route (`BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED` remains open).

## 18. R9.2-P6B — Approved-offer wiring into FixedOrder (2026-08-05)

The gap section 17 flagged is closed: `POST /api/fixed-orders/restoration-digital`
(the path already named in `FixedOrder`'s own schema comment, never
implemented until now) is real. `FixedOrderService.createRestorationDigitalOrder`
(new; reuses the existing `restoration.routes.ts` router — no new router/app
mount) resolves market/currency from the caller's own `RestorationDraft`,
prices the requested tier via `ApprovedOfferProvider` (production default;
`FixtureOfferProvider` is only ever test-injected), and persists exactly one
`FixedOrder` + `FixedOrderItem` with the exact PriceBook snapshot
(`priceBookVersion`, `priceBookApprovalReference`, `priceBookEffectiveAt`)
and `pricingApproved: true` / `pricingSource: "approved_pricebook"`. A
`local_fixture`-priced item can never be `pricingApproved: true`. The
client supplies only `draftId` + `tier`; amount/currency/version/source/
approval state are always server-resolved and any forged values in the
request are ignored (proven by test). Idempotent via the existing
`FixedOrder.sourceDraftId` unique index — a repeat submission (including a
page refresh) returns the same immutable order, proven under real
concurrency. Ownership reuses the existing `assertOwnership`/
`actorFromRequest` helpers unchanged (uniform 404, enumeration-safe).
Order creation stops before checkout/payment: zero `PaymentAttempt`,
`PaymentEvent`, `RestorationEntitlement`, `RestorationMaster`, or
`ReplicateExecution` row is ever created by this path (proven by test). No
checkout route was created; `BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED`
remains open, untouched. No customer-facing "review" UI exists in this
repository to wire pricing display into (the upload/draft-creation flow
itself is likewise still unwired to any route) — this is a pre-existing gap,
not introduced or closed by this packet; the API response already carries
exact server minor-unit pricing for whenever such a UI is built. Full
record: `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` section 18 and
`docs/restoration/P6B_APPROVED_OFFER_WIRING_PROTOCOL.md`.

## 19. R9.2-P6C — Customer MVP flow (2026-08-05)

**Historical-code audit (before writing anything new)**: `git log --all` for
`restoration-draft.controller.ts`/`.service.ts`/`.routes.ts` and
`FixedOrderReviewPage.tsx` found them added in exactly one commit,
`f47b6cf` ("chore: add repository project automation files"), on the local
branch `setup/project-automation` — a branch that diverged from `main` at
the old PR #118 merge point (before P4B/P4C-independent-review/P4D/P5A/
P5B/P6A/P6B ever happened) and was never merged. Its own `fixed-order.service.ts`
(355 lines) predates and directly conflicts with the already-merged, tested
P6B `fixed-order.service.ts` on `main`. `OriginalPreviewPage.tsx`/
`DigitalTierSelectPage.tsx` never existed anywhere in history under those
names. **Conclusion: this historical code is superseded, not missing by
accident** — it was an abandoned, stale, pre-P4B alternate implementation
that was correctly left uncherry-picked. The MVP below was built fresh
against current `main`, reusing only the still-current, already-tested
domain utilities (`imageValidation.ts`, `market.ts`, `ownership.ts`,
`guest-ownership.ts`, `priceBook.ts`/`offerProvider.ts`/
`approvedOfferProvider.ts`, and P6B's `fixed-order.service.ts` itself).

**What was built**: `RestorationDraftService` (+ controller + router) wires
`POST /api/restoration-drafts`, `GET /api/restoration-drafts/:id`, and
`GET /api/restoration-drafts/:id/offers` — market selection (country +
explicit confirmation, server-derived market/currency, never client-sent),
real decode/byte validation before any storage write, signed preview URL
(private storage key never returned), and approved-offer pricing via the
existing `ApprovedOfferProvider`. `FixedOrderService` (P6B) gained
`getByOrderNo` for the read-only review step
(`GET /api/fixed-orders/:orderNo`). Four new web pages
(`RestorationUploadPage`, `OriginalPreviewPage`, `DigitalTierSelectPage`,
`FixedOrderReviewPage`) implement the explicit-button flow: upload only on
button click; preview/tiers/review are GET-only on mount and refresh; order
creation only on button click; review shows server market/currency/tier/
amount/PriceBook version and a truthful "payment not yet available" state
(no MPGS checkout route was added). No PaymentAttempt, execution,
Replicate, or Sharp call occurs anywhere in this flow.

Full record: `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` section 19
and `docs/restoration/P6C_CUSTOMER_MVP_FLOW_PROTOCOL.md`.

## 20. R9.2-BAF-FINAL-CORRECTED-SESSION-PROOF (2026-08-05)

Current status: one final Bank Alfalah MPGS sandbox `POST /session` test used
the required API V100 PURCHASE payload and a corrected 19-character
alphanumeric diagnostic order ID. The result was HTTP `401` with
`{"error":{"cause":"INVALID_REQUEST","explanation":"Invalid credentials."},"result":"ERROR"}`;
no `session.id` or `successIndicator` was returned. This corrects the prior
42-character order-ID validation error but does not verify sandbox
authentication or session initiation. No retry, USD test, card data, capture,
production activation, checkout/product-code change, RunPod, Replicate, R2,
webhook, or deployment occurred. `BANK_ALFALAH_MPGS_ENABLED` remains `false`.

Exact launch blocker: Bank Alfalah must state whether the remaining remediation
is credential reset, profile permission, or a different endpoint; the exposed
API password must be rotated/reissued before any future request. The final
session-proof packet is 100% complete with 0% remaining; the MPGS launch gate
is 0% complete with 100% remaining until a 2xx response returns a valid
`session.id`. Sanitized, visually checked evidence PNGs are outside the
repository at `D:\Temp\claude\evidence\baf-final-request-response.png` and
`D:\Temp\claude\evidence\baf-final-conclusion.png`.

## 21. R9.2-MPGS-ACTUAL-APP-E2E (2026-08-05)

Confirmed (via the bank's own live v100 REST-JSON documentation) and
repaired the adapter's endpoint: Hosted Checkout initiation is
`POST .../merchant/{merchantId}/session` with a required
`interaction.merchant.name` field, not `PUT .../order/{orderId}/checkout`
(the shape the adapter had always used). This reconciles section 20's `401`
(correct endpoint, credential/profile blocker) with the earlier `404`
(wrong endpoint) into one consistent picture. New config:
`BANK_ALFALAH_MPGS_MERCHANT_NAME`.

Also found and repaired, only visible via a new actual-app dry-run harness
(real Postgres + real API + real web + real browser + a local stub
gateway, zero live network calls): the MPGS checkout routes were shadowed
by an earlier-mounted legacy route (moved to `/fixed-orders/:orderNo/
checkout`), and the rate-limit middleware shared one counter across every
route in the app (each call site now gets its own). Full record:
`docs/payments/bank-alfalah-mastercard/R9.2_MPGS_ACTUAL_APP_E2E_CONTRACT_CORRECTION_2026-08-05.md`
and manifest section 22.

No live sandbox request was made this session -- deliberately deferred to a
follow-up session after this packet's own dry-run-first risk-sequencing
decision. `BANK_ALFALAH_MPGS_ENABLED` remains `false`. Launch blocker
unchanged: a live 2xx response with `session.id` is still required, and the
exposed API password from section 20 should be confirmed rotated before
that attempt.

## 22. R9.2-MPGS-CI-LIVE-PROOF (2026-08-05)

Built and merged a two-mode GitHub Actions workflow (PR #139, merge
`288e981`): a `pull_request`-triggered `dry-run` job (stub gateway, zero
live calls) and a `workflow_dispatch`-only `live` job requiring an exact
confirmation-string input. The owner manually dispatched `live` four times
(per this packet's "assistant never dispatches" rule); the first three
made zero live requests (the workflow's own fail-closed input gating
correctly withheld the job each time -- `mode` left on default, then a
`confirm_live` mismatch); the fourth ran, exactly once.

**Result: `HTTP 401`.** Client integration compared field-by-field against
every bank instruction and the bank's own live documentation -- zero
remaining discrepancy. Classified fully verified; the `401` is bank-side
(credential/profile/authentication state on Bank Alfalah's sandbox),
matching section 20's prior `401` at the same endpoint, now independently
reproduced by an automated CI pipeline. `P4C_MPGS_AUTH_VERIFIED` still not
achieved. No code changes were needed. No support email sent. Full record:
`docs/payments/bank-alfalah-mastercard/R9.2_MPGS_CI_LIVE_PROOF_2026-08-05.md`
and manifest section 23.

Launch blocker unchanged: bank-side confirmation/resolution of the
sandbox credential/profile rejection is required before this integration
can reach `session.id`.

## 23. R9.2-FINAL-INDEPENDENT-MPGS-RAW-PROOF (2026-08-05)

PR #140 merged (`3cccfca`). All ten BAF evidence documents, the bank's V100
documentation, the adapter and all MPGS workflows were read completely and
consolidated into one authoritative contract table
(`docs/payments/bank-alfalah-mastercard/R9.2_MPGS_FINAL_CONTRACT_TABLE_AND_DRIFT_PROTECTION.md`):
**every dimension matches, zero client-side discrepancies**, with three
genuine source contradictions recorded rather than silently reconciled.

The independent raw re-test this packet specified was **not executed** --
manifest §21 already records that byte-for-byte identical request (V100
`/session`, `text/plain`, `PURCHASE`, merchant name, PKR 1.00, 19-char
alphanumeric order id) with the definitive result `HTTP 401 Invalid
credentials.` Re-running it would add nothing, spend another rationed live
request, and contradict the standing instruction to rotate the exposed
password first. Decisive supporting evidence: the correct password and a
deliberately wrong control password return **byte-identical** 401s, so the
gateway is not distinguishing the credential at all -- no client-side
change can affect the outcome.

Client integration is contract-complete. `P4C_MPGS_AUTH_VERIFIED` still not
achieved; `BANK_ALFALAH_MPGS_ENABLED` remains `false`. Only remaining
actions are bank-side: rotate/reissue the exposed API password, confirm the
reissued credential is provisioned for REST API access (distinct from
portal login), and confirm `/session` vs `/order/{id}/transaction` as the
intended entry point. Once done, the existing CI `live` job performs the
retest end to end with no new infrastructure.

## 24. R9.2-MERGE-P141-AND-FINAL-BANK-ALFALAH-SUPPORT-PACKET (2026-08-05)

PR #141 merged (`f6c0a0a`). Confirmed exactly one live actual-app request
has ever been made across every MPGS workflow (run `31042211650`); none
since. Assembled a sanitized support package outside the repository
(`D:\Temp\claude\evidence\baf-final-support\`: 3 visually-verified
secret-free screenshots, the contract comparison, request/response
summaries, and a draft-only email requesting password reissue + REST
permission confirmation + endpoint confirmation -- not production
credentials, not sent). Added
`R9.2_MPGS_SANDBOX_TO_PRODUCTION_PROCEDURE.md`: the exact 8-step sequence
for after the bank resolves sandbox access (one CI live run requiring real
2xx+session.id; one sandbox test-card transaction; mandatory server-side
Retrieve Order verification including 3DS; re-proven duplicate-event
idempotency against real payload shapes; inform bank of UAT pass; request
production go-live checklist; one bank-approved low-value production
transaction before public launch).

No code changed. `P4C_MPGS_AUTH_VERIFIED` still not achieved;
`BANK_ALFALAH_MPGS_ENABLED` remains `false`. Launch blocker unchanged and
now fully packaged for the owner to hand to Bank Alfalah at their
discretion.

## 25. R9.2-MERGE-P142-AND-PAYMENT-VERIFICATION-BRIDGE (2026-08-06)

PR #142 merged (`31d5dfe0932cf0af2caffe4ace1b3d00680d0891`, docs-only,
confirmed no code/secret/deployment/RunPod change). Wired
`CustomerCheckoutService.getStatus` to the existing, already race-tested
P4C/P4A verification chain (`handleMpgsBrowserReturn` →
`matchRetrievedOrderToAttempt` → `applyVerifiedPaymentEvidence`), which had
been built in earlier packets but was never reachable from any route. This
is now the sole path that can move a `PaymentAttempt` to `PAID`: never
trusts a browser return or query string; only a fresh, server-initiated
MPGS Retrieve Order call, matched field-by-field against the immutable
`FixedOrder`, can do it; duplicate/concurrent checks converge to exactly
one entitlement/execution; failed/pending/cancelled results never queue
processing; no webhook mutation (auth format still undocumented); no live
Bank Alfalah request or production activation.

Found and fixed a real, previously-latent defect: `createCheckout` wrote
`PaymentAttempt.providerRef` to the Hosted Checkout session id, which
would have made P4A's own mismatch guard reject every genuine first-time
verification with `PROVIDER_REFERENCE_MISMATCH`. Fixed before any real
transaction was attempted; permanent protection recorded in `rules.md`.

11 new disposable-PostgreSQL race tests added
(`customer-checkout.service.pg-race.test.ts`), covering success,
pending/failure, forged amount/order id, ownership, concurrent-duplicate
convergence, and zero-external-calls cases. Combined with existing suites:
79/79 pg-race, 48/48 unit, 58/58 Playwright, lint/typecheck/build/Prisma
all clean. Diff scope confirmed minimal (2 modified service files, 1 new
test file). Disposable Postgres and all processes confirmed cleanly
stopped. Full detail:
`docs/payments/bank-alfalah-mastercard/R9.2_PAYMENT_VERIFICATION_BRIDGE_2026-08-06.md`.

No live Bank Alfalah sandbox/production request made. `BANK_ALFALAH_MPGS_ENABLED`
unchanged. PR opened, not merged, not deployed. Bank-side sandbox
credential/profile blocker remains the only remaining launch blocker,
unchanged by this packet.

## 26. R9.2-MERGE-P143-AND-ONE-USD-SANDBOX-DIAGNOSTIC (2026-08-06)

PR #143 merged (`e05d04a5b46edffb9fc68ebc09ea9803c9e05a98`); full 79/79
pg-race + 162/163 unit (1 pre-existing unrelated `vitest`-only gap) +
58/58 Playwright + lint/typecheck/build/Prisma re-run clean before merge.

Audited every Bank Alfalah/MPGS document in the repository for currency
claims (evidence table:
`docs/payments/bank-alfalah-mastercard/R9.2_USD_CURRENCY_EVIDENCE_AUDIT_2026-08-06.md`).
Finding: MPGS is not USD-only; the bank directly confirmed the same
credentials work for both PKR and USD sandbox testing on this merchant
profile; the one PKR-only statement found in this repository belongs to a
different, already-retired protocol (Alfa APG), not MPGS. Currency support
is a merchant-profile-level property, not a per-currency one — evidenced by
the PKR leg's own persistent `401`.

Proved a real USD leg through the existing actual-app dry-run harness (no
duplicate integration): real INTERNATIONAL/USD `FixedOrder`, real
upload→preview→tiers→order→review flow, local stub gateway,
`order.currency=USD`, real PriceBook amount USD 1.50, order id well under
30/41-char limits, exactly one gateway call, zero live network calls. 7/7
dry-run tests pass, exit 0.

Parameterized (not duplicated) the existing live-sandbox spec/workflow with
a `currency` dispatch input (`PKR` default/unchanged, `USD` owner-gated) so
the owner can authorize exactly one real USD sandbox request through the
same proven pipeline. Per this repository's standing rule, only the owner
dispatches a live workflow run; this packet did not and does not do so
itself. As of this packet, that dispatch had not yet occurred — see the
currency evidence doc for the live outcome once it does.

New permanent protection (`rules.md`): generic MPGS/Mastercard
documentation's example currency values must never be treated as
merchant-profile currency authority — only a bank-specific,
merchant-profile-specific confirmation may enable/disable a currency.

No card data, no capture, no Retrieve Order call, no second bank request,
no RunPod/Replicate/R2/deployment/production-credential change. PR opened,
not merged, not deployed.

## 27. R9.2-CANCEL-WRONG-RUN-MERGE-P144-AND-WATCH-USD-PROOF / R9.2-CLASSIFY-USD-RUN-31061334403-AND-FINALIZE-P145 (2026-08-06)

Found run `31058730527` (dispatched on `main` before PR #144 merged, so its
workflow copy had no `currency` input yet) already completed — nothing to
cancel. Classified its evidence: one real request, `currency=PKR`,
`HTTP 401`, same failure shape as the first PKR live proof. Not the
owner-authorized USD request; does not consume or satisfy it.

PR #144 merged (`14a745b9274f3d6a23f03ce11ecb4be2c76cee3d`) after re-running
79/79 pg-race, 58/58 Playwright, 7/7 dry-run, 162/163 unit,
typecheck/build/Prisma clean, and establishing a truthful lint baseline
(repo-wide `exit 1` from 4 pre-existing, unrelated errors; zero findings in
the two `.ts` files this PR actually touches).

Re-verified updated `origin/main` from a fresh worktree: `currency` input
present (PKR default unchanged, USD selects INTERNATIONAL/USD, real
PriceBook USD 1.50, USD-specific artifact names, exactly-one-call assertion
and secret redaction intact). Full dry-run suite re-run from this fresh
`main` worktree: 7/7 pass, exit 0.

New permanent protection (`rules.md`): a `workflow_dispatch` must be run
from a ref that actually contains a just-added input's definition —
dispatching from an older ref silently drops it and can consume a
rationed live request on the wrong default path.

The owner then dispatched run `31061334403` on updated `main`
(`14a745b9...`) with `mode=live`, `currency=USD`. Dry-run skipped, live
job ran exactly once, succeeded end to end. Confirmed via the full
`api-server.log`: exactly one request, `POST .../session`, `currency=USD`,
no Retrieve Order, no PKR, no card data, no retry. **Result: `HTTP 401`**,
no `session.id`. All three screenshots and the Playwright trace visually
reviewed — Market INTERNATIONAL, Tier Original, Amount USD 1.50, no
secret visible anywhere; trace's browser network log shows zero
references to the real bank host.

**Classified: authentication/merchant-profile failure, confirmed
currency-independent** — three live requests across two currencies (PKR
×2, USD ×1) all return byte-identical `401`. Final short bank support
email (password reissue + REST permission confirmation) drafted, not
sent, per standing scope. `P4C_MPGS_AUTH_VERIFIED` remains NOT achieved.

No card data, no capture, no Retrieve Order call, no second bank request
made by this agent, no RunPod/Replicate/R2/deployment/production-credential
change. Evidence PR (docs-only) updated with this run's evidence and
merged after full checks.

## 28. R9.2-USD-RETEST-AFTER-BANK-ENABLEMENT-AND-COMPLETE-LAUNCH-READINESS (2026-08-06)

Bank confirmed USD newly enabled on sandbox MID `TESTGLOBALINDUS` and
requested a retry. Owner dispatched run `31084589628` on `main`
(`0e9f584...`, PR #145 HEAD), `mode=live`, `currency=USD` — newer than the
enablement email and prior run `31061334403`. Dry-run skipped, live job ran
exactly once. `api-server.log` confirms exactly one
`POST .../session` request, `currency=USD`, `merchant.name` present, zero
occurrences of `password`/`Authorization`/`PKR`/`capture`/`Retrieve`/`card`
anywhere in the log. **Result: `HTTP 401`** — no `session.id`.
**Classification: sandbox API credential/REST-permission failure, confirmed
unaffected by today's USD enablement** (4th live request, 4th byte-identical
401 shape). Final short bank email (password reissue + REST permission
confirmation) drafted, not sent. No second live request made.

Continued launch-candidate readiness from the prior session: root-caused
and repaired the 4 `.mjs` lint errors (`eslint.config.mjs` globals gap) and
the 1 vitest-only test non-pass (wrong-runner mismatch, not a code defect;
162 `tsx --test` + 14 `vitest` = 163). Added `npm run verify:launch-
candidate`. Proved the full local stubbed journey: 79/79 pg-race tests
(disposable local PostgreSQL 17) across all 8 suites, 58/58 Playwright
browser tests, typecheck/build/`prisma validate`/`migrate status`/`git
diff --check` all clean. Full details, Northflank GO/NO-GO table, and the
owner-operated staging sequence:
`docs/restoration/R9_2_LAUNCH_CANDIDATE_READINESS_PROTOCOL.md`. Disposable
Postgres cleanly torn down (process gone, port free, data dir deleted);
persistent system Postgres service untouched. No RunPod/Replicate/R2/Bank
Alfalah network call in any local test. No deployment.

## 29. R9.2-MERGE-P146-WORKER-SERVICE-READINESS-AND-DUAL-GATEWAY-PLAN (2026-08-06)

No new bank request made — task explicitly scoped to await the bank's
response. PR #146 re-verified (head `e3b34f9...` matched exactly, launch-
readiness scope only) and merged clean after a first-pass-clean full
re-run (verify:launch-candidate, 79/79 pg-race, 58/58 Playwright,
typecheck/build/Prisma/diff). **Merge SHA: `89f9bcd0736...`.**

Built the smallest repo-level Northflank worker-service definition
(`northflank/p4b-worker.service.yaml`, a reviewable reference, not applied
by any automation) for the existing, unmodified P4B runner. Proved live:
the worker binds zero ports standalone with no API running; the API
answers `/api/health` with no worker running; both run fully
independently. One-at-a-time claim, graceful shutdown, fail-closed config,
zero external calls, and restart-safety were already proven by the
existing `p4b-internal-worker-runner.service.pg-race.test.ts`
(re-run 10/10). Full record:
`docs/deployment/P4B_WORKER_SERVICE_READINESS_PROTOCOL.md`.

Wrote a dual-gateway (MPGS + possible local rail) readiness **plan**, not
an implementation: `docs/payments/R9_2_DUAL_GATEWAY_READINESS_PLAN.md`.
Key finding: `PaymentAttempt`/`PaymentEvent.provider` are already
free-text columns — a second provider needs no schema migration, only a
new adapter and a routing decision. Every bank-dependent detail (Merchant
ID count, endpoint shapes, callback scheme, settlement, refunds) is marked
`AWAITING_BANK_CONFIRMATION`; no local-gateway code was written.

Full regression re-run clean (fresh disposable PostgreSQL 17, 79/79
pg-race, 58/58 Playwright, verify:launch-candidate/typecheck/build/Prisma/
diff all exit 0) — no source code was touched this packet, so no repair
loop was needed. All three disposable Postgres instances used this packet
cleanly torn down; persistent system Postgres untouched throughout. No
RunPod/Replicate/R2/Bank Alfalah network call anywhere. No deployment.

## 30. R9.2-FREEZE-MPGS-AND-REACTIVATE-LOCAL-APG (2026-08-06)

Owner decision: MPGS commercially rejected and frozen; Bank Alfalah local
APG is the new intended route, subject to official bank documents not yet
received. No APG code until then. Inspected `main` and all open PRs — no
unmerged Mastercard-only PR exists (MPGS was merged long ago, already
disabled by default); nothing to close or supersede. No live bank
request, deployment, or production change made.

Verified the existing MPGS fail-closed mechanism (`BANK_ALFALAH_MPGS_ENABLED`
defaults false, checkout throws `PAYMENT_PROVIDER_UNAVAILABLE` before any
`PaymentAttempt` write, live workflow requires `mode=live` + exact
confirmation string) and added one status marker,
`MPGS_STATUS = "MPGS_COMMERCIAL_HOLD"`. No MPGS source/test/evidence
deleted or rewritten. Audited every legacy Alfa APG reference and
classified each (reusable guard test kept as-is, evidence docs kept as
historical record, confirmed nothing left to literally "reactivate" —
no `/HS/` route or legacy credential field exists in tracked source
today). Wrote a 13-row APG requirements matrix, every unknown marked
`AWAITING_BANK_CONFIRMATION`:
`docs/payments/R9_2_MPGS_FREEZE_AND_APG_REACTIVATION_PROTOCOL.md`.

Checkout now shows one truthful message ("Online payment is temporarily
unavailable.") both proactively and on failure — no bank-transfer/COD/
JazzCash/RAAST flow invented. Two Playwright specs asserting the old text
were updated and re-verified (58/58 pass).

Added `npm run verify:payment-freeze` (9 checks, zero external calls,
9/9 pass, every check proven against a temporary failing fixture then
reverted). Full test loop clean: verify:payment-freeze, verify:launch-
candidate, 79/79 pg-race, 58/58 Playwright, typecheck/build/Prisma/diff
all exit 0 (`verify:staging-preflight` not run — its script exists only
on the unmerged PR #148 branch). Disposable Postgres cleanly torn down;
persistent system Postgres untouched. No RunPod/Replicate/R2/Bank Alfalah
network call anywhere. No deployment, no merge.
