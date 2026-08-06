# R9.2 MPGS Freeze / Local APG Reactivation Protocol

**Owner decision (2026-08-06):** Mastercard MPGS is commercially rejected
and frozen. Bank Alfalah **local APG** is the new intended payment route,
subject to official bank documents not yet received. **No APG
implementation until official bank documents arrive.** No live bank
request, deployment, or production change was made by this packet.

## 1. MPGS freeze — status and mechanism

**Status: `MPGS_STATUS = "MPGS_COMMERCIAL_HOLD"`**, exported from
`apps/api/src/services/p4c-bank-alfalah-mpgs-gateway.service.ts`. This is
a **commercial** hold, not a technical retirement — MPGS source, tests,
and evidence remain fully tracked and unchanged in logic. Nothing was
deleted or rewritten.

The freeze is enforced by a mechanism that already existed before this
packet and was verified, not newly built:

- `BANK_ALFALAH_MPGS_ENABLED` (`apps/api/src/config/env.ts`) defaults to
  `"false"` — fail-closed by construction, no code path flips it true
  implicitly.
- `CustomerCheckoutService.createCheckout` checks
  `this.config.bankAlfalahMpgs.enabled` **before any `PaymentAttempt`
  mutation or network request** and throws
  `PAYMENT_PROVIDER_UNAVAILABLE` (503) if disabled — no customer can
  initiate MPGS checkout while frozen.
- The live-sandbox `workflow_dispatch` workflow
  (`.github/workflows/bank-alfalah-mpgs-actual-app-e2e.yml`) requires
  `mode=live` **and** `confirm_live=I_UNDERSTAND_THIS_CONTACTS_THE_REAL_BANK_SANDBOX`
  — no workflow can make a live request without explicit owner dispatch;
  this gate was not touched and remains in force.
- No production credential is required to keep the freeze in place — the
  freeze is the *absence* of `BANK_ALFALAH_MPGS_ENABLED=true` in any
  environment, not a credential-dependent behavior.
- Browser/query data cannot mark an order PAID: `handleMpgsBrowserReturn`
  always performs a fresh server-side Retrieve Order call before
  `applyVerifiedPaymentEvidence` runs; no controller/route calls
  `applyVerifiedPaymentEvidence` directly (proven by
  `p4a-payment-verified-execution-queue.service.pg-race.test.ts`'s static
  scan, unchanged).
- Existing verified payment/P4A protections are unchanged: no P4A, P4B,
  or gateway-verification source line was modified by this packet, only
  the additive `MPGS_STATUS` constant and its explanatory comment.

## 2. Legacy Alfa APG audit and classification

Every file this packet found referencing the legacy "Alfa APG v1.1"
protocol (`sandbox.bankalfalah.com`/`payments.bankalfalah.com`, `/HS/`
endpoints, Store ID/Key1/Key2, `HS_`-prefixed fields, AES/CBC signing):

| File | Classification | Notes |
|---|---|---|
| `apps/api/src/services/p4c-bank-alfalah-legacy-apg-retired.test.ts` | **Reusable generic component** | A repository-wide static scan that forbids the *retired* identifiers from becoming active anywhere again. Kept exactly as-is — it is the correct guard for a **new**, officially-documented local APG too: a future integration must be a new module under new names, never a reactivation of these specific retired identifiers. |
| `docs/payments/bank-alfalah-mastercard/MPGS_INTEGRATION_EVIDENCE.md` | **Historical evidence** | Documents the P4C decision to retire Alfa APG v1.1 in favor of MPGS and names the retired identifiers for the record (carries the retirement marker the scan test respects). |
| `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` §8 | **Historical evidence** | Records the original retirement decision and rationale (no working Alfa APG v1.1 implementation ever existed in this repository — confirmed by repo-wide grep at the time). |
| `rules.md` (P4C section) | **Historical evidence** | Records the retirement as a permanent rule; unchanged, still in force. |
| No `/HS/` route, controller, Store ID/Key1/Key2 field, or AES/CBC signing code exists anywhere in tracked source | **Obsolete/unsafe (confirmed absent)** | The legacy protocol was never actually implemented as working code in this repository — only referenced in evidence/retirement documents. There is nothing to "reactivate" in the literal sense; a real local APG integration must be built fresh against **new**, officially-confirmed bank documents. |
| Bank Alfalah local APG technical contract (endpoints, fields, signing scheme, credentials) | **Awaiting official bank confirmation** | No such document exists in this repository yet. See the requirements matrix below — every row is `AWAITING_BANK_CONFIRMATION`. |

**Conclusion: nothing is reactivated.** The retired `/HS/`-shaped protocol
stays retired and forbidden by its existing guard test. "Local APG" as the
owner's new intended route is treated as an **unknown, undocumented**
integration target — it happens to share a bank relationship with the
historical Alfa APG v1.1, but this repository holds no confirmation that
its technical contract is the same, similar, or different. No assumption
is made either way.

## 3. APG requirements matrix

Every row is `AWAITING_BANK_CONFIRMATION` unless explicitly marked
otherwise. No value here is invented; this table exists to make the next
session's bank-liaison conversation concrete, not to describe a real
integration.

| Requirement | Status | Notes |
|---|---|---|
| Merchant ID / account conversion (does the existing Bank Alfalah relationship convert to a local-APG merchant profile, or is separate onboarding required?) | `AWAITING_BANK_CONFIRMATION` | Not addressed by any document in this repository |
| Supported local payment methods (which wallets/rails: JazzCash, EasyPaisa, RAAST, bank transfer, others) | `AWAITING_BANK_CONFIRMATION` | Task explicitly forbids inventing any of these until confirmed |
| PKR / currency scope | `AWAITING_BANK_CONFIRMATION` | Local rails are typically PKR-only, but no confirming document exists |
| Session/checkout API shape | `AWAITING_BANK_CONFIRMATION` | The retired Alfa APG v1.1's `/HS/` shape must **not** be assumed to still apply |
| Callback / IPN / webhook mechanism and signature scheme | `AWAITING_BANK_CONFIRMATION` | Must preserve the existing "never trust a client-claimed success" rule regardless of scheme, once known |
| Status inquiry (equivalent of MPGS's Retrieve Order) | `AWAITING_BANK_CONFIRMATION` | Fail-closed verification-before-trust principle is non-negotiable and carries forward unconditionally |
| Refund / void | `AWAITING_BANK_CONFIRMATION` | No refund mechanism exists for MPGS either — this is a genuine gap for both providers |
| Settlement / reconciliation | `AWAITING_BANK_CONFIRMATION` | No settlement-file ingestion exists in this repository for any provider today |
| Authentication / signature scheme | `AWAITING_BANK_CONFIRMATION` | The retired Alfa APG v1.1 used AES/CBC request signing with Store ID/Key1/Key2 — **do not assume this still applies**; a new scheme must be independently confirmed |
| Sandbox / production endpoints | `AWAITING_BANK_CONFIRMATION` | The retired `sandbox.bankalfalah.com`/`payments.bankalfalah.com` hosts must not be reused without fresh confirmation they are even still the correct hosts for this route |
| Allowlisting (IP allowlist, callback URL allowlist, etc.) | `AWAITING_BANK_CONFIRMATION` | Not addressed anywhere |
| Fees / FED / security deposit | `AWAITING_BANK_CONFIRMATION` | Commercial terms, not addressed by any technical document in this repository |
| Go-live procedure (UAT → production activation steps) | `AWAITING_BANK_CONFIRMATION` | Not addressed anywhere |

**Reusable, provider-agnostic pieces already in place** (per
`docs/payments/R9_2_DUAL_GATEWAY_READINESS_PLAN.md`, unchanged by this
packet): `PaymentAttempt.provider`/`PaymentEvent.provider` are free-text
columns (no migration needed for a new provider name); the shared
`FixedOrder` → `PaymentAttempt` → `PaymentEvent` →
`applyVerifiedPaymentEvidence` chain; the "no implicit fallback between
providers" pattern already proven for `RestorationProviderRouter`; the
fail-closed verification-before-trust principle. None of this is
APG-specific — it is exactly the same shared foundation a real APG
integration would plug into once its contract is known.

## 4. Customer flow while frozen

Upload, preview, pricing, and `FixedOrder` creation remain fully
operational — none of this depends on any payment provider. Checkout
(`FixedOrderReviewPage.tsx`) shows exactly one truthful, fail-closed
message, both proactively (before any checkout attempt) and on an actual
`PAYMENT_PROVIDER_UNAVAILABLE` response:

> Online payment is temporarily unavailable.

No bank-transfer, COD, JazzCash, or RAAST flow was invented or implied
anywhere in the UI or API.

## 5. Result

- MPGS: frozen for commercial reasons, **not deleted**. Source, tests,
  and historical evidence remain tracked exactly as before, plus one
  additive `MPGS_STATUS = "MPGS_COMMERCIAL_HOLD"` constant.
- Local APG: selected as the intended route, **subject to official
  bank documents** — zero implementation exists or was added.
- No APG code activation occurred or will occur before bank confirmation
  of the requirements matrix above.
- The website (upload → preview → pricing → `FixedOrder`) may proceed to
  a payment-free staging deploy per
  `docs/deployment/R9_2_STAGING_RELEASE_PROTOCOL.md` — nothing in this
  packet changes that readiness.
- Commercial launch (real customer payment) remains blocked until a real
  payment provider (MPGS un-frozen, or a confirmed local APG) is
  implemented and verified end to end.
