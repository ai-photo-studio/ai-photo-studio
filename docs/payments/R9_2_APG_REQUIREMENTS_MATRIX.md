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

## Change log

- 2026-08-06 (R9.2-FREEZE-MPGS-AND-REACTIVATE-LOCAL-APG): matrix created,
  all 13 original rows `AWAITING_BANK_CONFIRMATION`.
- 2026-08-06 (R9.2-MERGE-P148-P149-AND-APG-URL-FOUNDATION): promoted to a
  standalone tracked document; return/listener/frontend URL rows and the
  allowlisting mechanism resolved (URLs defined, values still pending);
  every other row unchanged.
