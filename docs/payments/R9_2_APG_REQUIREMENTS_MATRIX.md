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
| Session/checkout API shape | **LIVE-PROVEN (HS1001 -> AuthToken -> SSO); INSTRUMENT-BLOCKED** | APG adapter and customer FixedOrder checkout use server-owned handshake/SSO fields; `HS_ChannelId=1001`/`HS_IsRedirectionRequest=0` returns a real `AuthToken` and SSO reaches the hosted checkout page every time (2026-08-28 reconfirmed) — the only remaining blocker is the Bank rejecting the published sandbox Wallet/Account/Card instruments themselves |
| Callback/IPN payload shape and signature scheme | `AWAITING_BANK_CONFIRMATION` | The listener URL exists and validates its documented `url` parameter's host, but the payload/signature contract itself is unknown |
| Status inquiry (equivalent of MPGS's Retrieve Order) | **FIXTURE_IMPLEMENTED; LIVE_BLOCKED** | Server verifies exact merchant/store/order/amount/currency, `ResponseCode=00`, and `TransactionStatus=Paid` before emitting P4A evidence |
| Acknowledgement requirements | `AWAITING_BANK_CONFIRMATION` | What response shape/timing the bank expects from the IPN listener |
| Authentication/signature | `AWAITING_BANK_CONFIRMATION` | How the bank authenticates to this listener, and how this server would authenticate outbound once status inquiry is implemented |
| Refund/void | `AWAITING_BANK_CONFIRMATION` | No refund mechanism exists for MPGS either — a genuine gap for both providers |
| Settlement/reconciliation | `AWAITING_BANK_CONFIRMATION` | No settlement-file ingestion exists in this repository for any provider today |
| Sandbox/production endpoints | **SANDBOX HS1001/SSO/HOSTED PAGE LIVE-PROVEN; PRODUCTION OFF** | BAF guide states sandbox `sandbox.bankalfalah.com` and production `payments.bankalfalah.com`; final 2026-08-27 UAT reached hosted checkout in all four mode configurations, but Bank rejected the supplied instruments |
| Allowlisting | **Mechanism defined, values pending** | `BANK_ALFALAH_APG_ALLOWED_CALLBACK_HOSTS` env var exists (empty by default, fail-closed); real host(s) are `AWAITING_BANK_CONFIRMATION` |
| Fees/FED/security deposit | `AWAITING_BANK_CONFIRMATION` | Commercial terms, not addressed by any technical document in this repository |
| Go-live procedure | `AWAITING_BANK_CONFIRMATION` | UAT → production activation steps not documented anywhere |
| Payment mutation | **SERVER-VERIFIED PATH; IPN SUPPLEMENTARY** | APG OrderStatus verification can emit P4A evidence only after exact merchant/store/order/amount/explicit currency/Paid matching; browser Return is non-authoritative. The official guide presents configured IPN as an alternative to direct OrderStatus, so IPN may remain supplementary and inert while callback auth/ack rules are unresolved |

## 2026-08-27 correction: Bank DOES publish sandbox sample data (supersedes prior "no published values" finding)

The 2026-08-27 entry below stating "no sandbox test Wallet/Account/Card
instrument values exist in any official source" is **corrected**. The
Merchant Portal Dashboard (`/MerchantPortal/Sandbox/Dashboard`), not the
Documentation/API Testing/Page Redirection pages previously checked, has a
"Sample Data For Testing" section with a Testing Data Type selector. With
Store fixed to `ThanNow`, it publishes exactly: Alfa Wallet
`930003009542301`, Alfalah Account `00141004533666`, Credit Card
`5440123456789012` / Expiry `01/30` / CVV `119`, SMS OTP `1234`, Email OTP
`1234`, SMS OTAC `12341234` — verified directly from the live portal DOM
this session, an exact match to the values already attempted.

**Corrected classification:**
`BANK_PUBLISHED_TEST_DATA_REJECTED_FOR_CURRENT_STORE_PROFILE` (was
incorrectly recorded as an absence of published data). The already-proven
browser-automated attempts using this exact data (runs `33066771977`
Wallet, `33067108363` Account — real transaction IDs created, Bank
responded `Invalid Account`, authoritative OrderStatus `Failed`; runs
`33068198382`, `33068348275` Card — rejected by the hosted page's own
PAN/expiry validator before transaction creation) already constitute the
"one controlled retry with Bank-published data" this correction calls for;
repeating them again would add no new evidence, so none was repeated. The
Dashboard's own text notes credit-card **API** access is unavailable
("API's for credit cards are not available") and recommends Page
Redirection for cards specifically — consistent with ThanNow's existing
implementation. No explicit per-store payment-mode enablement indicator
(enabled/disabled per Wallet/Account/Card) is shown anywhere in the portal
UI for `ThanNow` — this is itself now an explicit question for the Bank
escalation email below, since it cannot be self-diagnosed from the portal.

## 2026-08-27 merchant portal + official PDF review (instrument profile blocker confirmed)

Read the previously-unread `BAF/APG Merchant Integration Guide v1.1.pdf` in
full and inspected the authenticated Merchant Portal (Documentation >
Getting Started, Integration > API Testing, Integration > Page Redirection
Testing) for this exact merchant/store profile.

1. **`HS_IsRedirectionRequest` resolved definitively, no remaining doubt.**
   The PDF's own parameter table (p.7) states explicitly: `0` = "redirect
   customers on a page where merchants will get authentication token" (a
   separate handshake step then a separate SSO POST — exactly ThanNow's
   implemented flow); `1` = "handle the authentication token on the same
   page" (an AJAX/same-page variant). **`0` is the correct, spec-documented
   value for ThanNow's Page Redirection flow** — the portal's own
   `PageRedirectionTesting` demo widget merely *defaults* its sample HTML
   to `1` because that widget demonstrates the alternate same-page mode;
   this is not evidence against `0`. This fully corroborates both the
   Bank's earlier direct chat confirmation and the live `AuthToken`-success
   proof already on record. No further action needed on this field.
2. **No sandbox test Wallet/Account/Card instrument values exist in any
   official source.** The PDF's only account-shaped example is inside a
   generic *response* sample (`AccountNumber = "930003331234567"` under a
   fabricated `TransactionId`/`OrderDateTime` from 2019 documentation
   boilerplate, not a real usable sandbox value) — it documents response
   *shape*, not usable *input* test data. The Merchant Portal's
   Documentation and Integration pages likewise contain no "Sample Data
   For Testing" section for Wallet/Account/Card numbers, OTP, or card test
   PAN/expiry. Per this task's own instruction, 18 more blind attempts were
   not made. Classification stands as
   `BANK_SANDBOX_INSTRUMENT_PROFILE_ACTION_REQUIRED`: the owner-supplied
   instrument values (Wallet, Account, Card PAN 5440...) were reasonable
   guesses, not Bank-confirmed sandbox test data, and no document/portal
   page supplies the real ones. This is a Bank-side gap, not a ThanNow
   app defect — the earlier proven `HS1001->AuthToken->SSO->hosted page`
   pipeline is unaffected and remains correct.

Merchant/store/hash/username/password values visible in portal
textboxes/PDF samples during this review were not recorded, copied, or
committed anywhere.

## 2026-08-27 full hosted checkout UAT final result

The prior missing-instrument and direct-HS blockers are superseded. Final
isolated runs reached the real hosted page for Wallet, Account, Card, and empty
All Modes. Wallet (`33066771977`, transaction `443330289493`) and Account
(`33067108363`, transaction `446691489639`) were rejected by Bank as
`Invalid Account`; authoritative OrderStatus was `Failed`. Card
(`33068198382`) and All Modes selecting Card (`33068348275`) were rejected by
the Bank page's PAN/expiry validators before transaction creation. No OTP or
successful Return occurred, no PAID evidence was applied, and no processing
started. Actual blocker: Bank must activate/correct test instruments for this
merchant/store and provide successful OrderStatus with explicit PKR currency.
API 1002, `DoTran`, and `ProcessTran` are not ThanNow fallbacks.

## 2026-08-27 hosted checkout page form contract + submission attempt

Read-only recon (run `33063400318`) reached the real hosted page
(`merchants.bankalfalah.com/Payments/Payments/Create`) and proved its form
contract: `PaymentTypeId` select (`1`=Alfa Wallet, `2`=Alfalah Bank
Account, `3`=Credit/Debit/Prepaid Card, `6`=Card on Delivery, `11`=JazzCash,
`12`=RAAST QR — confirms the packet's 1/2/3/empty mapping for the first
three), `CardTypeId` select (`1`=Visa, `2`=Master Card, `3`=Amex,
`4`=Paypak), and named fields `AlfaWalletNumber`, `AccountNumber`,
`CardNumber`/`CVV`/`ExpiryMonth`/`ExpiryYear`, OTP fields `alfaSMSOTP`/
`alfaEmailOTP`/`alfalahOTP`, and two hidden tokens
(`__RequestVerificationToken`, `base64`).

A same-session submission attempt for Alfa Wallet (run `33063607266`)
returned **`HTTP 500`** on the base page's hidden-token values. Root cause:
the mode-specific sub-form (and its own antiforgery token) is loaded by the
hosted page's own client-side JS/AJAX **after** `PaymentTypeId` is
selected in a real browser — it is not present in the initial server HTML a
plain HTTP client fetches. Completing a real submission therefore requires
either (a) genuine browser-session automation with the exact cookies
established by the HS1001/SSO POSTs carried into a rendered browser, or (b)
the bank's documented AJAX/partial-view contract for the mode-specific
sub-form. Neither exists yet; further blind field-guessing against the live
sandbox endpoint was deliberately stopped rather than repeated across
modes. Classification: `HOSTED_PAGE_JS_SUBFORM_AUTOMATION_REQUIRED` — a
genuine technical gap, not a Bank-side blocker and not a ThanNow app defect
(the ThanNow customer-checkout flow itself does not depend on this recon
tooling).

## 2026-08-27 live sandbox proof (run `33062332340`)

With the corrected `HS_IsRedirectionRequest=0`, GitHub Actions run
`33062332340` proved: `HS1001` (`POST /HS/HS/HS`) → `HTTP 200`,
`success=true`, **AuthToken present** → `SSO` (`POST /SSO/SSO/SSO`) →
`HTTP 302` redirect to `merchants.bankalfalah.com/Payments/Payments/Create`
(a real Bank-hosted checkout page). "Session/checkout API shape" and
"Sandbox/production endpoints" rows above move from
`FIXTURE_IMPLEMENTED; LIVE_BLOCKED` to **LIVE-PROVEN for handshake + SSO
reachability**; direct HS1001 hosted-page access is no longer blocked. No
secret/AuthToken value was logged. The run did not submit the hosted
checkout page itself — no Bank-supplied sandbox test card/wallet/account/
OTP data exists in this repository to do so safely; that is the new
blocker (see `R9_2_APG_SANDBOX_UAT_CHECKLIST.md`).

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
