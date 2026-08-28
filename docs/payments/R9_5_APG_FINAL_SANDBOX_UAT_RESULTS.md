# R9.5 — APG Final Sandbox UAT Results (2026-08-28)

Run against the recovered ThanNow runtime (see
`docs/deployment/R9_4_NORTHFLANK_RUNTIME_RECOVERY.md`). Production
payment flags stayed `false`/`none` throughout — sandbox only.

## Precheck

| Check | Result |
| --- | --- |
| `GET /api/health` | 200 |
| `GET /api/packages` (DB-backed) | 200 |
| `GET /api/monitoring/queue` (Redis-backed) | 200, `healthy:true` |
| Live deployed SHA | `e411ccd61fed4ccf91a952195fd6890c9596a44a` |

## HS1001 / AuthToken / SSO (proven again this run, all 4 modes)

- `HS1001_HTTP_STATUS=200`, `AuthToken` present — every run.
- `SSO_HTTP_STATUS=302`, hosted Bank page reached — every run.

## Per-mode results

| Mode | Instrument | Hosted page | Result | Transaction ID | OrderStatus |
| --- | --- | --- | --- | --- | --- |
| Wallet | published Alfa Wallet sample | reached, submitted | Rejected — `Invalid Account` | `301954137241` | `Failed`, merchant/store/order match true, amount 1.00, `Currency` absent |
| Account | published Alfalah Account sample | reached, submitted | Rejected — `Invalid Account` | `302795473632` | `Failed`, merchant/store/order match true, amount 1.00, `Currency` absent |
| Card | published Card PAN/expiry/CVV | reached, Luhn/expiry check runs | Rejected — hosted page's own client-side validator (`CheckLuhnsAlgo`, `CheckExpiryYear`) clears Card Number + Expiry Month before submission | none issued | not created (`ResponseCode=11`, no merchant/store/order match) |
| All Modes | (selector defaults to Card sub-view) | reached | Same as Card | none issued | not created |

Card mode was run twice: once before and once after fixing a genuine
test-script defect (see below) that had left `CardNumber`/`ExpiryMonth`
unfilled on the first attempt. The second run typed the fields via real
keystroke events and confirmed the Bank's own client-side validator
still clears them — this is a Bank/store-profile rejection, not a
script or app defect.

## Test-script repair (not application code)

`scripts/bank-alfalah-apg-hosted-checkout-uat.ts`: `fillVisible()` used
`.fill()` only, which some hosted-page fields (masked Card Number /
Expiry Month) silently discard because they only react to real
keystroke events. Fixed by falling back to `pressSequentially()` when
`.fill()` leaves the field empty. This is UAT tooling, not the
production payment path — no ThanNow payment code was touched.

## Classification

**BANK_PUBLISHED_SAMPLE_REJECTED_FOR_STORE_PROFILE** — reconfirmed with
fresh transactions today. HS1001/AuthToken/SSO integration is fully
correct; every published sandbox instrument is rejected by the Bank
itself. No application defect. No ThanNow payment code was modified.

Escalation email refreshed and kept
`docs/payments/R9_2_APG_BANK_ENABLEMENT_EMAIL_DRAFT.md` —
**READY_TO_SEND**, awaiting owner authorization.

## Production safety

- `BANK_ALFALAH_PROVIDER=none`, `BANK_ALFALAH_APG_ENABLED=false`,
  `BANK_ALFALAH_MPGS_ENABLED=false` unchanged throughout.
- Sandbox Bank calls: 8 (HS1001 ×4 modes, SSO ×4 modes, plus per-mode
  payment submission and OrderStatus).
- Production Bank calls: 0. Real charges: 0.
