# R9.2 Bank Alfalah Local APG Requirements Matrix

Canonical, standalone tracked matrix (carried forward from
`docs/payments/R9_2_MPGS_FREEZE_AND_APG_REACTIVATION_PROTOCOL.md` §3,
updated with the now-defined URL foundation from
`docs/payments/R9_2_APG_URL_INGRESS_PROTOCOL.md`). Every row not
explicitly resolved by a URL-foundation packet remains
`AWAITING_BANK_CONFIRMATION` — no value here is invented.

| Requirement | Status | Notes |
|---|---|---|
| Return URL | **Defined** | `https://api.thannow.com/api/payments/bank-alfalah/return` — exists, disabled by default, never marks PAID |
| Listener (IPN) URL | **Defined** | `https://api.thannow.com/api/payments/bank-alfalah/ipn` — exists, disabled by default, validates but never fetches the documented `url` parameter |
| Frontend return landing page | **Defined** | `https://thannow.com/payment/return` — shows the truthful fail-closed message only |
| Merchant ID / account conversion | `AWAITING_BANK_CONFIRMATION` | Does the existing Bank Alfalah relationship convert to a local-APG merchant profile, or is separate onboarding required? |
| Supported local payment methods | `AWAITING_BANK_CONFIRMATION` | Which wallets/rails (JazzCash, EasyPaisa, RAAST, bank transfer, others) — none invented |
| PKR / currency scope | `AWAITING_BANK_CONFIRMATION` | Local rails are typically PKR-only, but no confirming document exists |
| Session/checkout API shape | `AWAITING_BANK_CONFIRMATION` | The retired Alfa APG v1.1's `/HS/` shape must **not** be assumed to still apply |
| Callback/IPN payload shape and signature scheme | `AWAITING_BANK_CONFIRMATION` | The listener URL exists and validates its documented `url` parameter's host, but the payload/signature contract itself is unknown |
| Status inquiry (equivalent of MPGS's Retrieve Order) | `AWAITING_BANK_CONFIRMATION` | Fail-closed verification-before-trust principle is non-negotiable and carries forward unconditionally; no fetch occurs today |
| Acknowledgement requirements | `AWAITING_BANK_CONFIRMATION` | What response shape/timing the bank expects from the IPN listener |
| Authentication/signature | `AWAITING_BANK_CONFIRMATION` | How the bank authenticates to this listener, and how this server would authenticate outbound once status inquiry is implemented |
| Refund/void | `AWAITING_BANK_CONFIRMATION` | No refund mechanism exists for MPGS either — a genuine gap for both providers |
| Settlement/reconciliation | `AWAITING_BANK_CONFIRMATION` | No settlement-file ingestion exists in this repository for any provider today |
| Sandbox/production endpoints | `AWAITING_BANK_CONFIRMATION` | The retired `sandbox.bankalfalah.com`/`payments.bankalfalah.com` hosts must not be reused without fresh confirmation |
| Allowlisting | **Mechanism defined, values pending** | `BANK_ALFALAH_APG_ALLOWED_CALLBACK_HOSTS` env var exists (empty by default, fail-closed); real host(s) are `AWAITING_BANK_CONFIRMATION` |
| Fees/FED/security deposit | `AWAITING_BANK_CONFIRMATION` | Commercial terms, not addressed by any technical document in this repository |
| Go-live procedure | `AWAITING_BANK_CONFIRMATION` | UAT → production activation steps not documented anywhere |
| Payment mutation | **Explicitly deferred** | No code path from either route reaches `applyVerifiedPaymentEvidence` — by design, until every row above is resolved |

## APG adapter implementation gate

**No APG adapter work (session/checkout request construction, status
inquiry, acknowledgement handling, signature/authentication, or payment
mutation) may begin until the bank has provided all twelve items below.**
Every item is `AWAITING_BANK_CONFIRMATION` until a real, dated bank
document exists in this repository confirming it. **None of these values
may be inferred, guessed, or copied from the retired Alfa APG v1.1 files**
— that protocol is retired, and a shared bank relationship does not imply
a shared technical contract.

| # | Required item | Status |
|---|---|---|
| 1 | Merchant ID / Store ID requirements | `AWAITING_BANK_CONFIRMATION` |
| 2 | Sandbox and production hosts | `AWAITING_BANK_CONFIRMATION` |
| 3 | Authentication/signature rules | `AWAITING_BANK_CONFIRMATION` |
| 4 | Handshake/session request fields | `AWAITING_BANK_CONFIRMATION` |
| 5 | Return URL parameter contract | `AWAITING_BANK_CONFIRMATION` |
| 6 | Listener acknowledgement and retry behavior | `AWAITING_BANK_CONFIRMATION` |
| 7 | Permitted OrderStatus URL hosts/paths | `AWAITING_BANK_CONFIRMATION` |
| 8 | Status inquiry response fields | `AWAITING_BANK_CONFIRMATION` |
| 9 | Success/failure status mapping | `AWAITING_BANK_CONFIRMATION` |
| 10 | Refund/void APIs | `AWAITING_BANK_CONFIRMATION` |
| 11 | Settlement/reconciliation details | `AWAITING_BANK_CONFIRMATION` |
| 12 | Sandbox test cases and go-live procedure | `AWAITING_BANK_CONFIRMATION` |

**Gate status: CLOSED.** 0/12 items confirmed. The URL foundation (return
route, IPN listener, frontend page — see the table above) is intentionally
outside this gate: it is ingress plumbing only, already built and tested,
and does not constitute "adapter work" under this gate's definition.

## Change log

- 2026-08-06 (R9.2-FREEZE-MPGS-AND-REACTIVATE-LOCAL-APG): matrix created,
  all 13 original rows `AWAITING_BANK_CONFIRMATION`.
- 2026-08-06 (R9.2-MERGE-P148-P149-AND-APG-URL-FOUNDATION): promoted to a
  standalone tracked document; return/listener/frontend URL rows and the
  allowlisting mechanism resolved (URLs defined, values still pending);
  every other row unchanged.
- 2026-08-06 (R9.2-MERGE-P150-AND-PAYMENT-FREE-STAGING-RC): added the
  explicit 12-item APG adapter implementation gate, closed (0/12), no
  values inferred from legacy files.
