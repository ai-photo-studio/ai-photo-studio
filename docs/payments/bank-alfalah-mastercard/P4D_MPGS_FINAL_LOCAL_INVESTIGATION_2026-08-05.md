# Bank Alfalah MPGS — Final Local Investigation (R9.2-MERGE-P134-AND-MPGS-FINAL-LOCAL-INVESTIGATION)

**Status:** `P4C_MPGS_AUTH_VERIFIED` still **NOT achieved**. Two independent,
concrete, disambiguated blockers are now documented: (1) a credential
rejection confirmed identically across three separate endpoint shapes, and
(2) a new, gateway-stated structural lead that this repository's coded
Hosted-Checkout endpoint suffix may be wrong for this merchant's gateway
build. `BANK_ALFALAH_MPGS_ENABLED` remains `false`. No adapter/gateway code
was changed by this packet — see "Conditional repair" below for why.
**Packet:** R9.2-MERGE-P134-AND-MPGS-FINAL-LOCAL-INVESTIGATION
**Date:** 2026-08-05
**Builds on:** `P4D_SESSION_ENDPOINT_AUTH_DIAGNOSTIC_2026-08-05.md` (same
date, prior session in this same investigation).

## 1. Authoritative document review

Read completely: all five prior `docs/payments/bank-alfalah-mastercard/*.md`
evidence files; both PDFs in `BAF/` (`APG Merchant Integration Guide
v1.1.pdf` — the retired legacy Alfa APG protocol, extracted in full via
PyPDF2 since `pdftoppm`/poppler is not installed in this environment;
`wadl20090202.pdf` — confirmed to be a **generic 2009 W3C-style WADL
specification with no Bank-Alfalah- or MPGS-specific content**, not usable
as evidence); the current `p4c-bank-alfalah-mpgs-gateway.service.ts` /
`customer-checkout.service.ts` source and tests; the legacy-retirement scan
test. No bank email or literal cURL-transcript file exists anywhere in this
repository — all "bank-confirmed" facts are owner-reported prose recorded in
`P4D_BANK_CONFIRMED_MERCHANT_PROFILE_2026-08-05.md`. No MPGS documentation
links were supplied in this session.

### Comparison matrix

| Dimension | Legacy Alfa APG (RETIRED, forbidden) | MPGS Hosted Checkout (coded in repo) | MPGS Hosted Session / V100 unified (task/bank-specified) |
|---|---|---|---|
| Host | `sandbox.bankalfalah.com` / `payments.bankalfalah.com` | `test-bankalfalah.gateway.mastercard.com` | same host |
| Init method/path | `POST /HS/api/HSAPI/HSAPI` → `POST /HS/api/Tran/DoTran` → `POST /HS/api/ProcessTran/ProTran` (3-call chain) | `PUT /api/rest/version/{v}/merchant/{merchantId}/order/{orderId}/checkout` | `POST /api/rest/version/100/merchant/{merchantId}/session` |
| API version | none (unversioned proprietary REST) | `74` (repo default) → bank-confirmed `100` | `100` |
| `apiOperation` | none (proprietary `HS_*` fields) | `INITIATE_CHECKOUT` | `INITIATE_CHECKOUT` |
| `interaction.operation` | none | `PURCHASE` | `AUTHORIZE` (per task spec) |
| Required payload fields | `HS_ChannelId`, `HS_MerchantId`, `HS_StoreId`, `HS_ReturnURL`, `HS_MerchantHash`, `HS_MerchantUsername`, `HS_MerchantPassword`, `HS_TransactionReferenceNumber`, `HS_RequestHash` | `apiOperation`, `checkoutMode`, `interaction.operation`, `interaction.returnUrl`, `order.id`, `order.amount`, `order.currency` | `apiOperation`, `order.id`, `order.amount`, `order.currency`, `interaction.operation` |
| Basic Auth username | none (credentials are body fields, not HTTP Basic) | `merchant.<merchantId>` | `merchant.<merchantId>` (identical) |
| API-password role | one of several body fields, folded into an AES/CBC/PKCS7-signed `RequestHash` using separate `Key1`(key)/`Key2`(IV) | HTTP Basic Auth password | same |
| Operator-ID role | not applicable (field does not exist in this protocol) | portal-login metadata only, never sent to any REST endpoint | same |
| Content-Type | JSON body / form-style field map, then AES-signed | `application/json` | `text/plain` per bank cURL (Test A) vs `application/json` (Test B) — both tested, both behave identically |
| Signing/hash | AES/CBC/PKCS7Padding of concatenated field string | none (HTTPS + HTTP Basic only) | none |
| PKR/USD capability | PKR only ("Currency ... will always be PKR") | PKR enabled (`standard-pattern-fallback`); USD gated separately, bank-confirmed for sandbox testing only (not `SANDBOX_VERIFIED`) | identical currency gating, independent of endpoint choice |
| Retrieve/inquire order | GET-style IPN inquiry: `.../HS/api/IPN/OrderStatus/{merchantId}/{storeId}/{orderId}` | `GET /api/rest/version/{v}/merchant/{merchantId}/order/{orderId}` | same path family, tested directly below (Test C) |
| Card handling | Redirect-only for card; Wallet/Bank-account via REST, no redirect | Redirect via `session.id`/`successIndicator` | Redirect via `session.id`/`successIndicator` |
| Merchant ID length | numeric string, no fixed-length rule in the legacy guide (examples: `"197"`, `"170"`) | not length-checked in code; bank confirmed exactly 15 characters for this merchant (`TESTGLOBALINDUS`) | same, exact 15 characters used throughout |

## 2. Credential-byte audit (no value printed anywhere)

| Field | Length | SHA-256 | CR/LF/space/tab/quote/BOM/trailing-newline |
|---|---|---|---|
| Merchant ID | 15 | `0818335dbc8888289473fa7f770bc88862945187a6d058dc91582983f419bbee` | none found |
| API Password | 32 | `9bf7f03738bfc489246214ba46e11aa2480595edb6e01f3004cc92683f7805f2` | none found |

Basic Auth username `merchant.<Merchant ID>`: length 24, byte-exact match to
`"merchant." + merchantId`. Target URL
`https://test-bankalfalah.gateway.mastercard.com/api/rest/version/100/merchant/TESTGLOBALINDUS/session`:
length 101, no literal quote, no percent-encoded character, no whitespace,
no backslash, no doubled slash beyond the scheme.

## 3. Minimum auth-isolation matrix (4 live requests, no card data, no charge)

All requests used `curl.exe --user` plus `--data-binary @file` (bodies
written to a file first, never inlined as a `curl` argument, avoiding the
PowerShell JSON-requoting artifact identified in the prior session). No
deliberately-wrong password was repeated in this session. No shortened
Merchant ID was tested. USD was not attempted (PKR did not succeed).

| Test | Request | HTTP status | Response body |
|---|---|---|---|
| A | `POST .../session`, `Content-Type: text/plain` | `401` | `{"error":{"cause":"INVALID_REQUEST","explanation":"Invalid credentials."},"result":"ERROR"}` |
| B | `POST .../session`, `Content-Type: application/json` | `401` | identical to A |
| C | `GET .../order/{unique-nonexistent-diagnostic-id}` (Retrieve Order, read-only) | `401` | identical to A/B |
| D | `PUT .../order/{id}/checkout` (current coded shape, structural comparison only) | `404` | `{"error":{"cause":"INVALID_REQUEST","explanation":"After url path /rest/version/100/merchant/TESTGLOBALINDUS/order/{id}, expected /transaction"},"result":"ERROR"}` |

No `WWW-Authenticate` or correlation/request/support-ID header was present
on any response. All `curl` exit codes `0`; timings 1.1–1.6s. Resolved host
IP: `216.119.223.23`.

## 4. Interpretation (per this task's own rubric)

- **A, B, C all `401`, byte-identical** ⇒ **credential/API-user/permission
  defect**. This is now confirmed across three independent endpoint shapes
  (Create Session with two content-types, plus Retrieve Order) rather than
  the single shape tested in the prior session — materially stronger
  evidence that the blocker is the credential/provisioning state itself,
  not any one endpoint's routing.
- **D's `404` response body names the exact path segment the gateway
  expected (`/transaction`, not `/checkout`)**. This is a new, separate,
  strong lead: this merchant's specific MPGS gateway build may not serve
  the `/order/{orderId}/checkout` (Hosted Checkout "Initiate Checkout")
  operation this repository's code currently implements at all, and may
  instead expect `/order/{orderId}/transaction` (the direct
  Pay/Authorize/Capture "Transaction API" path family) or `/session` as the
  sole valid entry point for this profile.

## 5. Conditional repair: NOT performed

This session's task rule permits an adapter repair only "when bank email
plus official documentation conclusively prove the current adapter endpoint
is wrong." Test D's live gateway error string is a strong, reproducible,
directly-observed lead — but it is neither a bank email nor official
documentation, so it does not meet the stated bar. Per that rule, this
session made **no change** to `p4c-bank-alfalah-mpgs-gateway.service.ts`,
made **no change** to `BANK_ALFALAH_MPGS_ENABLED` (remains `false`), and
does **not** mark authentication verified (no real authenticated request
has succeeded). This finding is recorded here as a lead for the owner to
put directly to Bank Alfalah, not acted upon unilaterally.

## 6. Exact Bank Alfalah questions now required (verbatim)

> "(1) Testing `POST /api/rest/version/100/merchant/TESTGLOBALINDUS/session`
> and `GET /api/rest/version/100/merchant/TESTGLOBALINDUS/order/{id}`
> (Retrieve Order) — both Basic Auth, username `merchant.TESTGLOBALINDUS` —
> return `HTTP 401 Invalid credentials` identically. Can you confirm or
> reissue the exact current API Password for this V100 sandbox merchant
> profile? (2) Separately, `PUT
> /api/rest/version/100/merchant/TESTGLOBALINDUS/order/{id}/checkout`
> returns `HTTP 404` with the body `"After url path
> .../order/{id}, expected /transaction"` — does this mean this merchant's
> gateway profile is provisioned for the direct Transaction API
> (`/order/{id}/transaction`) rather than Hosted Checkout's `/checkout`
> operation, or is `/session` (Create Session / Hosted Session) the only
> integration path enabled for this profile?"

## 7. PR #134 verification and merge

- `gh pr view 134`: `headRefOid ca6b1144ccaced3dea8e6291a2a6d1ca5e1b4f40`
  (exact match), `mergeStateStatus CLEAN`, `mergeable MERGEABLE`, no failing
  required check. Scope: 5 files, all P4E customer-checkout UI/test/docs —
  no secret, webhook, capture, deployment, or RunPod reference.
- Verified in an isolated worktree before merge: Playwright **58/58**,
  `typecheck` exit 0, `lint` 0 errors, `build` exit 0.
- Merged via `gh pr merge 134 --merge`. **Merge SHA:
  `6dcc5c32a5326cd7f45623be515fc55d79bf6d0f`.**

## 8. Full regression after merge (disposable PostgreSQL 17)

Disposable cluster: loopback-only, random port, `pwfile.txt` deleted
immediately after `initdb`, before the cluster started; never the
persistent `postgresql-x64-17` service.

- **58/58 DB-level checks passed**: `customer-checkout.service.test.ts` (1),
  `fixed-order.service.pg-race.test.ts` (16),
  `p4c-bank-alfalah-mpgs-gateway.service.pg-race.test.ts` (6),
  `p4a-payment-verified-execution-queue.service.pg-race.test.ts` (14),
  `p4b-internal-worker-runner.service.pg-race.test.ts` (9),
  `restoration-draft.service.pg-race.test.ts` (9),
  `sharp-variant.service.pg-race.test.ts` (3).
- `typecheck` exit 0 (both workspaces). `lint` exit 0 (89 pre-existing
  warnings, no new). `build` exit 0 (both workspaces). `prisma validate`:
  schema valid.
- **Playwright full browser regression: 58/58 passed** (re-run post-merge).
- **Cleanup proof**: `pg_ctl -m fast stop` → "server stopped"; PID
  confirmed gone; port confirmed free; persistent service confirmed
  `Running`/untouched throughout; disposable temp directory deleted.

## 9. Protected-scope confirmation

No card data, no capture, no live financial transaction, no production
credential, no legacy `sandbox.bankalfalah.com`/`/HS/` endpoint touched, no
RunPod/Replicate/R2 call, no checkout/customer-route code change as a
result of any auth failure. Four live sandbox HTTP requests this session,
all fully sanitized; zero requests beyond the four explicitly specified. No
Merchant ID, API Password, or Operator ID value is recorded anywhere in
this document; the password existed only in a process-scoped environment
variable, never printed, logged, base64-displayed, or written to any file.
`BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED` is retained, not
retired.
