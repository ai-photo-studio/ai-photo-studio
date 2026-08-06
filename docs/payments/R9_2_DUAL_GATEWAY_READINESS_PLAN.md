# R9.2 Dual-Gateway Readiness Plan (decision document, not an implementation)

Status: **planning only. No local gateway code, endpoint, or credential is
invented or implemented by this document.** Every bank-dependent item below
is explicitly marked `AWAITING_BANK_CONFIRMATION` and must not be assumed.
This document reads the existing MPGS evidence set and payment architecture
already in this repository; it does not add a second payment provider.

## 1. What already exists (verified from source, not assumed)

- **`FixedOrder` → `PaymentAttempt` → `PaymentEvent` → `applyVerifiedPaymentEvidence`
  → `ReplicateExecution`** is the one, shared transaction chain
  (`apps/api/src/services/p4a-payment-verified-execution-queue.service.ts`).
  Nothing about this chain is Bank-Alfalah-specific at the schema level.
- **`PaymentAttempt.provider` is already a free-text `String` column**
  (`@default("bank_alfalah")`, `apps/api/prisma/schema.prisma`), not a hard
  enum. Adding a second provider value (e.g. `"jazzcash"`) requires **no
  schema migration** — only a new gateway-adapter module and routing
  decision at checkout-session creation time.
- **`PaymentAttempt` already carries its own `providerRef` and a composite
  `@@index([provider, providerRef])`** — the schema already anticipated more
  than one provider's reference-id namespace coexisting.
- **`PaymentEvent.provider` + `providerEventId` + a unique
  `@@unique([provider, providerEventId])`** — event dedupe is already scoped
  per-provider, so two gateways' event streams can never collide even if
  both used numeric/opaque ids in the same ranges.
- **The only currently-implemented gateway is Bank Alfalah MPGS**
  (`apps/api/src/services/p4c-bank-alfalah-mpgs-gateway.service.ts`):
  Hosted Checkout session creation (`POST .../merchant/{id}/session`,
  V100) + a mandatory server-side Retrieve Order call before any payment is
  ever trusted. It never trusts a browser return or webhook payload's
  claimed status. This gateway's REST access currently returns `HTTP 401`
  in sandbox — `P4C_MPGS_AUTH_VERIFIED` not yet achieved (see release
  manifest §23-§29).
- **No JazzCash, RAAST, EasyPaisa, or any other local rail integration
  exists anywhere in this repository.** Confirmed by search: zero files,
  zero env vars, zero mentions outside this new planning document.

## 2. Capability matrix

| Concern | MPGS (card, existing) | Local rail (JazzCash/RAAST-shaped, hypothetical) |
|---|---|---|
| Currencies | PKR (verified doc-confirmed), USD (doc-confirmed enabled by bank, sandbox REST currently 401 for both) | **AWAITING_BANK_CONFIRMATION** — typically PKR-only for domestic wallet/RAAST rails, but this repository has no confirming document |
| Merchant ID(s) | One sandbox MID confirmed so far (`TESTGLOBALINDUS`) | **AWAITING_BANK_CONFIRMATION** — whether the same Bank Alfalah relationship covers a local rail under one merchant profile, or requires a distinct merchant/aggregator onboarding (JazzCash and RAAST are typically separate onboarding processes from a card acquirer, even when the same bank is involved), is unknown. **Do not assume one MID covers both** without an explicit bank/aggregator document. |
| Checkout mechanism | Hosted Checkout (redirect/iframe to Mastercard gateway) | **AWAITING_BANK_CONFIRMATION** — JazzCash/RAAST typically use a different mechanism (mobile-wallet OTP push, intent/deep-link, or a bank's own local API), never assume it mirrors Hosted Checkout's shape |
| Verification model | Server-side Retrieve Order (GET, polls until terminal) — never trusts webhook/browser claim alone | **AWAITING_BANK_CONFIRMATION** of the equivalent status-inquiry endpoint; the **fail-closed principle itself (never trust a client-claimed success) is non-negotiable and must be preserved for any new provider**, even before the exact endpoint shape is known |
| Callback/webhook | Not currently wired to any route (MPGS gateway module is not registered on any Express router — see rules.md P4C section) | **AWAITING_BANK_CONFIRMATION** of signature scheme; must never be trusted as sole evidence regardless of scheme, per the existing pattern |
| Settlement/reconciliation | No settlement-file ingestion exists yet in this repo for MPGS either | **AWAITING_BANK_CONFIRMATION** for both providers — this is a genuine gap for MPGS too, not unique to a hypothetical local rail |
| Refunds | Not implemented for MPGS | **AWAITING_BANK_CONFIRMATION** — no refund endpoint exists for either provider today |
| Credentials | `BANK_ALFALAH_MPGS_MERCHANT_ID` / `_API_PASSWORD` / `_OPERATOR_ID` (sandbox, `401`) | **AWAITING_BANK_CONFIRMATION** — no credential names are invented here; whatever the bank/aggregator issues, name the env vars only after the real contract is confirmed |

## 3. Customer payment-method selection (design, not implementation)

If a second provider is ever authorized:

- The **existing** `POST /api/fixed-orders/restoration-digital` (P6B) stays
  the sole `FixedOrder` creation path — payment-method choice must happen
  **after** order creation, at checkout-session creation, never at order
  creation (preserving the existing "order creation stops before payment"
  rule in `rules.md`).
- A new, explicit `paymentMethod` (or equivalent) field would be read only
  from the checkout-session-creation request, validated against a small
  enum of **currently enabled** methods per market/currency (mirroring how
  `MPGS_CURRENCY_SUPPORT` already gates PKR/USD) — never inferred, never
  defaulted to a not-yet-verified provider.
- `CustomerCheckoutService` (or a small router in front of it) would select
  the gateway adapter by `paymentMethod`, construct exactly one
  `PaymentAttempt` with `provider` set accordingly, and delegate to that
  provider's own session-creation call — the shared P4A verification
  transaction boundary is untouched either way.

## 4. Provider routing (design)

- One small `PaymentGatewayRouter`-shaped seam (not yet built) would map
  `paymentMethod` → the correct gateway adapter instance, analogous to how
  `RestorationProviderRouter` already routes `RESTORATION_PROVIDER` to
  Replicate only, with an explicit, exhaustive switch and no implicit
  fallback between providers (same "no implicit fallback" rule already
  proven for the restoration-provider router, `RestorationProviderRouter.test.ts`
  `"no implicit fallback: a Replicate dispatch failure is not retried on
  any other provider"`) — a failed MPGS session must never silently retry
  against a local rail, or vice versa.
- Each gateway adapter stays fully independent (own module, own config
  namespace, own tests) — exactly the existing `p4c-bank-alfalah-mpgs-
  gateway.service.ts` shape, duplicated in structure for a second provider,
  never merged into one god-module.

## 5. Shared model, separate credentials/endpoints/callbacks

- **Shared, unchanged**: `FixedOrder`, `PaymentAttempt`, `PaymentEvent`,
  `applyVerifiedPaymentEvidence`, the P4A transaction boundary, the P4B
  worker. No new table is needed for a second provider — `provider` is
  already a free-text column on both `PaymentAttempt` and `PaymentEvent`.
- **Separate, per provider**: credential env-var namespace (e.g.
  `BANK_ALFALAH_MPGS_*` vs. a to-be-named local-rail namespace — names not
  invented here), gateway adapter module, session-creation endpoint shape,
  status-inquiry/verification endpoint shape, and callback/webhook route
  (if any) if the second provider requires one Express route the first
  doesn't.
- **Never shared**: no credential value, endpoint, or signature scheme may
  be reused or assumed to be identical across two different banking rails
  even if the underlying bank relationship is the same institution.

## 6. Fail-closed behavior (non-negotiable across every provider)

Every rule already proven for MPGS must hold identically for any future
provider, with zero exception carved out:

- Browser/query data never marks a payment PAID (server-side verification
  only).
- Mismatched order/amount/currency/merchant-id fails closed.
- A pending/failed retrieved status is never processed as success.
- Duplicate/concurrent verification attempts create exactly one execution
  (existing P4A/P4B atomic-claim behavior already provider-agnostic since
  it operates on `PaymentAttempt`/`ReplicateExecution`, not on gateway
  internals).
- No provider's callback/webhook payload is ever trusted as sole evidence
  — a server-initiated status/retrieve call to that provider's own API is
  always required before `applyVerifiedPaymentEvidence` runs.

## 7. Explicit non-goals of this document

- Does not implement any local gateway adapter, route, or config field.
- Does not name a specific local-rail provider as chosen — "JazzCash/RAAST"
  in this document is illustrative of the **class** of local Pakistani
  payment rail the task named, not a confirmed integration target.
- Does not invent any credential name, endpoint URL, or callback signature
  for a local rail — every such detail in this document is marked
  `AWAITING_BANK_CONFIRMATION` and must stay that way until an official
  document from the bank/aggregator exists in this repository.

## 8. Open questions requiring bank/owner confirmation before any code is written

1. Is a local rail (JazzCash/RAAST/EasyPaisa or similar) actually planned,
   and through which relationship — the same Bank Alfalah merchant profile,
   a separate aggregator, or a direct wallet-provider integration?
2. If planned, does it require a second, distinct Merchant ID, or can the
   existing MPGS merchant profile cover both card and local-rail
   transactions?
3. What is the real session-creation/checkout-initiation endpoint shape?
4. What is the real server-side status/verification-inquiry endpoint
   shape (the equivalent of MPGS's Retrieve Order)?
5. Is there a webhook/callback, and if so, what signature/verification
   scheme does it use?
6. What refund and settlement/reconciliation mechanisms exist, if any?
7. Which currencies and markets does the local rail actually support?

Until these are answered with an official document, this repository
implements **zero** local-gateway code — this plan exists solely so that,
once answered, implementation can proceed directly against a known-correct
contract instead of guessing.
