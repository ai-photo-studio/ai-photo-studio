# R9.2 Bank Alfalah APG Sandbox UAT Checklist

Status: **EXECUTED — BANK INSTRUMENT/PROFILE ACTION REQUIRED (2026-08-27).**
HS1001, AuthToken, SSO, hosted checkout, Wallet/Account submission, Card
validation, All Modes selection, and OrderStatus were exercised in sandbox.
No successful payment occurred: Bank rejected Wallet/Account as Invalid Account
and rejected Card PAN/expiry before transaction creation. See
`R9_2_APG_REQUIREMENTS_MATRIX.md` for final run IDs and sanitized results.
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

## Preconditions before successful-payment UAT can resume

1. Bank activates/corrects Wallet, Account, and Card test instruments for the
   active ThanNow sandbox merchant/store profile.
2. Bank successful OrderStatus includes explicit `Currency=PKR`, or Bank
   supplies an authoritative revised status contract that preserves exact
   currency verification.
3. Rerun Wallet, Account, Card, and empty All Modes independently.

IPN authentication/acknowledgement remains unresolved, but official Bank
evidence makes IPN supplementary to direct authoritative OrderStatus. API 1002,
`DoTran`, and `ProcessTran` are not prerequisites for this Page Redirection UAT.
