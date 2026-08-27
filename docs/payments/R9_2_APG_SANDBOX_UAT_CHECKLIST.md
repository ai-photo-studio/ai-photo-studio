# R9.2 Bank Alfalah APG Sandbox UAT Checklist

Status: **PREPARED — NOT EXECUTED.** No case below may be run against a live
bank sandbox until the Bank confirms HS1001 direct access, the RequestHash
contract, and IPN authentication/acknowledgement (see
`R9_2_APG_REQUIREMENTS_MATRIX.md` and `R9_2_APG_BANK_ENABLEMENT_EMAIL_DRAFT.md`).
`BANK_ALFALAH_PROVIDER` must stay `none` and `BANK_ALFALAH_APG_ENABLED` must
stay `false` in production until every case below has passed in sandbox and
the owner has approved go-live.

Each case states the expected server-side result. "PASS" means the existing
fail-closed/verification code already produces that result today (proven by
unit/fixture tests); "PENDING BANK" means the case cannot be exercised for
real until the Bank enables sandbox access.

| # | Case | Expected result | Current status |
|---|---|---|---|
| 1 | Successful payment (OrderStatus `ResponseCode=00`, `TransactionStatus=Paid`, matching merchant/store/reference/amount/currency) | Exactly one `applyVerifiedPaymentEvidence` call; one `PaymentAttempt` marked paid | PASS (fixture-tested) |
| 2 | Failed payment (`ResponseCode != 00`) | `BankAlfalahApgProtocolError` thrown; no evidence applied; no PAID state | PASS (fixture-tested) |
| 3 | Cancelled payment (bank reports cancelled/declined status) | Same as failed: rejected, no evidence applied | PASS (fixture-tested) |
| 4 | Invalid RequestHash (bank rejects handshake/transaction due to hash mismatch) | `initiateHandshake`/`createTransaction` surfaces the bank's `ErrorMessage`/non-2xx as a thrown `BankAlfalahApgProtocolError`; no retry, no evidence applied | PASS (structurally — real bank rejection text is PENDING BANK) |
| 5 | Valid Return (browser redirect hit with documented `orderNo`/`sessionId`) | `GET /return` logs presence only, always responds `PAYMENT_UNAVAILABLE` while disabled; never marks PAID from a query parameter | PASS |
| 6 | Valid IPN (approved-host `url` posted while APG enabled) | `202 ACKNOWLEDGED_NO_ACTION`; no fetch, no mutation (status-inquiry/ack contract still `AWAITING_BANK_CONFIRMATION`) | PASS (deliberately inert) |
| 7 | Invalid IPN (missing/malformed/non-HTTPS/unapproved-host `url`) | `400 APG_IPN_URL_REJECTED` with reason; fails closed | PASS |
| 8 | Duplicate IPN (same `url`/order posted twice) | Both calls independently fail closed today (no mutation either way); once status-inquiry is implemented, `p4a-payment-verified-execution-queue` dedupe hash must make the second call a no-op | PASS today by inertness; real dedupe path is PENDING BANK (status-inquiry not yet wired to IPN) |
| 9 | Duplicate IPN causes zero double-charge/double-evidence | `dedupeHash = sha256(bank_alfalah|reference|transactionId|amount|currency)` already exists in `verifyAndApplyOrderStatus`; needs an end-to-end test once IPN triggers a real status inquiry | PARTIAL — dedupe hash proven at the evidence layer; not yet exercised from the IPN route since the route never calls status inquiry |
| 10 | Return before IPN | Return never mutates state regardless of order, so this ordering is inherently safe | PASS |
| 11 | IPN before Return | Same — IPN (while inert) and Return are both non-authoritative; no ordering dependency exists | PASS |
| 12 | Amount/currency mismatch between order and bank status | `getOrderStatus` throws `BankAlfalahApgProtocolError` on any amount/currency mismatch before evidence is applied | PASS (fixture-tested) |
| 13 | Unknown transaction (bank has no record / 404) | `postJson`/`getOrderStatus` throws on non-2xx or malformed body | PASS (fixture-tested) |
| 14 | No false PAID state under any of the above | No code path outside `verifyAndApplyOrderStatus`'s exact-match success branch calls `applyVerifiedPaymentEvidence`; enforced structurally and by `verify:apg-sandbox-ready` (10/10) and `verify:apg-url-contract` (12/12) | PASS |

## Preconditions before any case can be executed for real

1. Bank confirms HS1001 direct hosted-page sandbox access for the ThanNow
   merchant/store identifiers (see enablement email draft).
2. Bank confirms the exact RequestHash field order/encoding/delimiter
   contract (currently `AWAITING_BANK_CONFIRMATION`).
3. Bank confirms IPN authentication and acknowledgement format.
4. Bank confirms whether `AccountNumber`/`Country`/`EmailAddress` are
   required on `DoTran` (see the 2026-08-25 forensic table in
   `R9_2_APG_REQUIREMENTS_MATRIX.md`).
5. Owner approves running a real sandbox transaction (this checklist alone
   is not that approval).

Until all five are satisfied, cases 4, 6, 8, 9, and 13 can only be exercised
against fixtures, not a live bank sandbox. Zero bank calls were made in the
preparation of this checklist.
