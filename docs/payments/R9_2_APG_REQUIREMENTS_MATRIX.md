# R9.2 Bank Alfalah Local APG Requirements Matrix

Canonical, standalone tracked matrix (carried forward from
`docs/payments/R9_2_MPGS_FREEZE_AND_APG_REACTIVATION_PROTOCOL.md` §3,
updated with the now-defined URL foundation from
`docs/payments/R9_2_APG_URL_INGRESS_PROTOCOL.md`). Every row not
explicitly resolved by documented protocol evidence or a fixture-backed
implementation remains
`AWAITING_BANK_CONFIRMATION` — no value here is invented.

| Requirement | Status | Notes |
|---|---|---|
| Return URL | **Defined** | `https://api.thannow.com/api/payments/bank-alfalah/return` — exists, disabled by default, never marks PAID |
| Listener (IPN) URL | **Defined** | `https://api.thannow.com/api/payments/bank-alfalah/ipn` — exists, disabled by default, validates but never fetches the documented `url` parameter |
| Frontend return landing page | **Defined** | `https://thannow.com/payment/return` — shows the truthful fail-closed message only |
| Merchant ID / account conversion | `AWAITING_BANK_CONFIRMATION` | Does the existing Bank Alfalah relationship convert to a local-APG merchant profile, or is separate onboarding required? |
| Supported local payment methods | `AWAITING_BANK_CONFIRMATION` | Which wallets/rails (JazzCash, EasyPaisa, RAAST, bank transfer, others) — none invented |
| PKR / currency scope | `AWAITING_BANK_CONFIRMATION` | Local rails are typically PKR-only, but no confirming document exists |
| Session/checkout API shape | **FIXTURE_IMPLEMENTED; LIVE_BLOCKED** | APG adapter and customer FixedOrder checkout use server-owned handshake/SSO fields; direct sandbox hosted-page enablement still returns `PAYMENT_UNAVAILABLE` without `AuthToken` |
| Callback/IPN payload shape and signature scheme | `AWAITING_BANK_CONFIRMATION` | The listener URL exists and validates its documented `url` parameter's host, but the payload/signature contract itself is unknown |
| Status inquiry (equivalent of MPGS's Retrieve Order) | **FIXTURE_IMPLEMENTED; LIVE_BLOCKED** | Server verifies exact merchant/store/order/amount/currency, `ResponseCode=00`, and `TransactionStatus=Paid` before emitting P4A evidence |
| Acknowledgement requirements | `AWAITING_BANK_CONFIRMATION` | What response shape/timing the bank expects from the IPN listener |
| Authentication/signature | `AWAITING_BANK_CONFIRMATION` | How the bank authenticates to this listener, and how this server would authenticate outbound once status inquiry is implemented |
| Refund/void | `AWAITING_BANK_CONFIRMATION` | No refund mechanism exists for MPGS either — a genuine gap for both providers |
| Settlement/reconciliation | `AWAITING_BANK_CONFIRMATION` | No settlement-file ingestion exists in this repository for any provider today |
| Sandbox/production endpoints | **DOCUMENTED; SANDBOX ENABLEMENT PENDING** | BAF guide states sandbox `sandbox.bankalfalah.com` and production `payments.bankalfalah.com`; production remains fail-closed |
| Allowlisting | **Mechanism defined, values pending** | `BANK_ALFALAH_APG_ALLOWED_CALLBACK_HOSTS` env var exists (empty by default, fail-closed); real host(s) are `AWAITING_BANK_CONFIRMATION` |
| Fees/FED/security deposit | `AWAITING_BANK_CONFIRMATION` | Commercial terms, not addressed by any technical document in this repository |
| Go-live procedure | `AWAITING_BANK_CONFIRMATION` | UAT → production activation steps not documented anywhere |
| Payment mutation | **SERVER-VERIFIED PATH; IPN DEFERRED** | APG OrderStatus verification can emit P4A evidence only after exact matching; browser Return and IPN remain non-authoritative while Bank callback auth/ack rules are unresolved |

## 2026-08-27 bank-confirmed HS1001/SSO field correction

Bank Alfalah responded to the sandbox enablement request asking for our
HS and SSO code, then confirmed: **`HS_ChannelId: "1001"`** (unchanged —
already correct) and **`HS_IsRedirectionRequest: "0"`** (correction — the
implementation previously sent `"1"`) for the `HS1001` Page Redirection
handshake (`POST /HS/HS/HS`, `initiateRedirectionHandshake` /
`buildRedirectionHandshakePayload`). Applied to
`bank-alfalah-apg-gateway.service.ts` and its unit tests; the API-channel
1002 handshake (`buildHandshakePayload`, `ChannelId: "1002"`, no
`IsRedirectionRequest` field) is unaffected. Verified: affected test file
9/9 pass, `verify:apg-url-contract` 12/12, `verify:apg-sandbox-ready`
10/10, `typecheck` clean. `HS_IsRedirectionRequest` moves from an
internal best-effort guess to **CONFIRMED** for this endpoint; the
RequestHash field order/encoding itself remains
`AWAITING_BANK_CONFIRMATION`.

## 2026-08-25 contract forensic (owner-supplied `BAF/API/API.txt`)

Field-by-field classification against the owner-supplied API-channel 1002
sample payloads (`BAF/API/API.txt`, untracked reference material) and the
current implementation (`bank-alfalah-apg-gateway.service.ts`,
`bank-alfalah-request-hash.ts`, `bank-alfalah-apg.controller.ts`):

| Item | Status | Notes |
|---|---|---|
| Handshake field set (`HS1001`/`HSAPI`) | **PROVEN** | Implementation's field names/keys for the handshake payload match `API.txt` exactly (`HS_ChannelId`…`HS_TransactionReferenceNumber`, `HS_RequestHash`) |
| Transaction (`DoTran`) field set | **MISSING** | `buildTransactionPayload` omits three fields present in the bank's own `DoTran` sample body: `AccountNumber`, `Country`, `EmailAddress`. Not added here because whether they must be present (even empty) for a valid `RequestHash` is itself part of the unconfirmed hash contract — adding them would mean guessing hash input composition, which this repository does not do |
| RequestHash field order/encoding | `AWAITING_BANK_CONFIRMATION` (unchanged) | `API.txt`'s JSON key order (`ChannelId` first) differs from the implementation's ordered-field arrays (`MerchantId` first for the transaction/SSO cases); JSON key order in a documentation sample is not proof of a required concatenation order, so this remains correctly unresolved rather than silently "fixed" either direction |
| AES-128-CBC + base64 encryption shape | **PROVEN (structurally)** | `encryptApgRequestHash` implements the algorithm family the Merchant Integration Guide names; exact key/IV provisioning and whether this is the correct cipher mode remain `NEEDS_BANK_CONFIRMATION` since no bank-signed sample ciphertext exists to validate against |
| Third flow step: `ProcessTran`/OTP (`/HS/api/ProcessTran/ProTran`) | **MISSING** | `API.txt` documents a third step (SMS/Email OTAC + OTP + `HashKey`) after `DoTran` that has no corresponding adapter method, endpoint, or test anywhere in this codebase. Not built in this packet — building a full OTP step is a genuine feature addition, not a same-shape gap repair, and the OTP flow's own hash/field contract is equally unconfirmed |
| Return URL / IPN URL / frontend landing page | **Defined** (unchanged from below) | |
| Status inquiry (`OrderStatus`) field set | **PROVEN** | `getOrderStatus` request path and response field parsing match `API.txt`/guide `OrderStatus` shape; exact-match verification (merchant/store/reference/amount/currency/`ResponseCode=00`/`TransactionStatus=Paid`) already implemented and covered by existing tests |

No source file was changed by this forensic pass: every finding above is
either already correctly `AWAITING_BANK_CONFIRMATION`/disabled-by-default,
or is a scope gap (`ProcessTran`, three `DoTran` fields) whose correct fix
depends on the same unconfirmed bank contract, so guessing it would violate
the "no invented bank behavior" rule. These rows are surfaced so the bank
email/UAT plan account for them explicitly.

## Change log

- 2026-08-25 (R9.2-APG-UAT-READY forensic pass): added the contract
  forensic table above; no implementation change; two real scope gaps
  (`ProcessTran`/OTP step, three `DoTran` fields) identified and classified
  rather than guessed.
- 2026-08-06 (R9.2-FREEZE-MPGS-AND-REACTIVATE-LOCAL-APG): matrix created,
  all 13 original rows `AWAITING_BANK_CONFIRMATION`.
- 2026-08-06 (R9.2-MERGE-P148-P149-AND-APG-URL-FOUNDATION): promoted to a
  standalone tracked document; return/listener/frontend URL rows and the
  allowlisting mechanism resolved (URLs defined, values still pending);
  every other row unchanged.
- 2026-08-11 (R9.5-P6B): owner-supplied `BAF/APG Merchant Integration Guide
  V1.1` reconciled the APG handshake and sandbox/production hosts as a
  distinct documented protocol. No APG implementation or credential was
  activated; the Get Free Seeds live-store credentials remain unsafe for
  ThanNow sandbox testing.
- 2026-08-11 (R9.5-P6C): added a separate disabled-by-default APG adapter for
  the API-channel 1002 material in `BAF/API/API.txt`. The adapter builds the
  server-owned handshake, transaction, SSO, and OrderStatus contracts and can
  emit P4A evidence only after exact status/identity/amount/currency matching.
  The request-hash algorithm and inbound IPN authentication remain
  `BANK_CONFIRMATION_REQUIRED`; no sandbox call was made.
- 2026-08-25 (R9.2-APG-SANDBOX-WIRING): customer FixedOrder checkout now selects
  the fixture-tested APG adapter only when `BANK_ALFALAH_PROVIDER=apg` and
  `BANK_ALFALAH_APG_ENABLED=true`; defaults remain fail-closed, MPGS remains
  frozen, and browser Return/IPN mutation remains deferred.
