# R9.2 APG URL Ingress Protocol

Status: **SUPERSEDED for the "live hosted-page enablement" claim below — see
`docs/payments/R9_5_APG_FINAL_SANDBOX_UAT_RESULTS.md` and
`docs/payments/R9_2_APG_SANDBOX_UAT_CHECKLIST.md`. HS1001 -> AuthToken -> SSO
-> hosted Bank checkout page is live-proven in sandbox (2026-08-27,
reconfirmed 2026-08-28); the only remaining blocker is the Bank rejecting the
published sandbox Wallet/Account/Card instruments. IPN
authentication/acknowledgement remains genuinely unresolved and is
supplementary to the authoritative server-side OrderStatus verification
already implemented in `verifyAndApplyOrderStatus`.**
The rest of this document (URL foundation, SSRF prevention, contract checks)
is unchanged and still accurate. MPGS remains commercially frozen
(`MPGS_STATUS = "MPGS_COMMERCIAL_HOLD"`). No live bank charge, MPGS
activation, or production deployment was made by this packet.

## R9.5-P6B BAF/APG reconciliation (2026-08-11)

The owner-supplied `BAF/APG Merchant Integration Guide V1.1` is an Alfa
Payment Gateway (APG) redirection protocol, not Mastercard MPGS. It documents
the APG sandbox host `sandbox.bankalfalah.com`, production host
`payments.bankalfalah.com`, a form POST to `/HS/HS/HS`, an `auth_token` handoff
to `/SSO/SSO/SSO`, merchant/store credentials (`MerchantId`, `StoreId`,
`MerchantHash`, `MerchantUsername`, `MerchantPassword`), and status inquiry at
`/HS/api/IPN/OrderStatus/{MerchantId}/{StoreId}/{OrderId}`. It also documents a
POST IPN listener receiving a `url` parameter and requiring a subsequent GET
  status inquiry. These facts are recorded as the evidence-backed protocol;
  live hosted-page enablement and IPN mutation remain blocked.

This differs from the current ThanNow MPGS adapter, which uses the Mastercard
gateway REST v100 Hosted Checkout flow and `Retrieve Order`. The APG
foundation routes remain deliberately fail-closed until the Bank confirms the
complete ThanNow merchant/store, authentication, callback, acknowledgement,
and status contract.

The Get Free Seeds screenshot says “Generate integration credentials for live
account” and supplies `getfreeseeds.com` Return/Listener URLs. Those
credentials are classified `LIVE_OR_STORE_SPECIFIC_UNTIL_PROVEN_OTHERWISE` and
are **not safe for ThanNow sandbox testing**. The guide’s sandbox procedure
requires entering the APG sandbox through the merchant portal and generating
credentials there; it does not state that another store’s live credentials can
be reused against sandbox. ThanNow must use its own Bank-approved sandbox
merchant/store credentials and its own URLs above.

## R9.5-P6C implementation boundary

The separate `BankAlfalahApgGateway` uses explicit provider selection through
`BANK_ALFALAH_PROVIDER=apg` plus `BANK_ALFALAH_APG_ENABLED=true`; the default
provider is `none`. MPGS remains selected only by
`BANK_ALFALAH_PROVIDER=mpgs` and its existing adapter is not replaced or used
as a fallback.

The APG adapter and customer FixedOrder checkout implement fixture-tested,
server-owned API-channel 1002
payloads and endpoints from `BAF/API/API.txt`:

- Handshake: `POST /HS/api/HSAPI/HSAPI`
- Transaction payload: `POST /HS/api/Tran/DoTran`
- SSO redirect form: `POST /SSO/SSO/SSO`
- OrderStatus: `GET /HS/api/IPN/OrderStatus/{MerchantId}/{StoreId}/{OrderId}`

The adapter rejects disabled/missing/malformed configuration, takes order
number/amount/currency from server-side arguments, validates exact merchant,
store, reference, amount, currency, response code `00`, and `TransactionStatus
= Paid`, then hands only normalized evidence to the existing P4A idempotency
boundary. It never trusts browser success parameters. The Return route remains
non-authoritative and the IPN route remains fail-closed because the supplied
guide does not define inbound IPN authentication/signature or acknowledgement
requirements. The supplied guide also refers to request-hash sample code that
is not present, so the adapter refuses real handshake generation with
  `BANK_CONFIRMATION_REQUIRED` until Bank confirms the live contract.

## R9.5-P6C sandbox result

ThanNow APG credentials are injected only by secure sandbox workflow
environment references. The
credential-shaped values in `BAF/API/API.txt` were not copied, printed, or
used because the file does not establish ThanNow ownership or its Return URL.
Classification: `BANK_DIRECT_HOSTED_PAGE_ENABLEMENT_PENDING`. Fixture tests and
`npm run commerce:dryrun` remain zero-charge paths until Bank enables direct
ThanNow sandbox hosted-page access and confirms IPN authentication.

## 1. Exact URLs

| Purpose | URL |
|---|---|
| Return (browser) | `https://api.thannow.com/api/payments/bank-alfalah/return` |
| Listener (server-to-server IPN) | `https://api.thannow.com/api/payments/bank-alfalah/ipn` |
| Frontend landing page | `https://thannow.com/payment/return` |

Local route paths (environment-owned origin, no hardcoded host):
`GET /api/payments/bank-alfalah/return`, `POST /api/payments/bank-alfalah/ipn`,
frontend `/payment/return`.

## 2. Behavior contract

- **Disabled by default**: `BANK_ALFALAH_APG_ENABLED` defaults `"false"`.
  Both routes exist (so the bank can validate reachability once given the
  URLs) but always respond truthfully — the return route always reports
  `PAYMENT_UNAVAILABLE`; the IPN listener returns `503 APG_DISABLED` while
  disabled.
- **Return route never marks PAID**: only reads two documented-shaped
  query parameter *names* (`orderNo`, `sessionId`) purely to log their
  presence — never to infer or write payment status. No
  `applyVerifiedPaymentEvidence` call exists anywhere in this module.
- **Frontend shows pending/unavailable truthfully**: `/payment/return`
  never reads a URL query parameter and always renders exactly "Online
  payment is temporarily unavailable."
- **Listener accepts the documented `url` parameter** and validates it
  against an **exact, environment-owned hostname allowlist**
  (`BANK_ALFALAH_APG_ALLOWED_CALLBACK_HOSTS`, comma-separated, empty by
  default — fails closed until the owner configures real, bank-confirmed
  hosts). Validation requires: present, well-formed, `https:` scheme
  exactly, and an exact (not prefix/suffix/substring) hostname match
  against the allowlist. Classic SSRF tricks (userinfo-embedded host,
  approved-looking substrings in the path) are rejected because
  `URL.hostname` parsing is used, never string matching on the raw input.
- **The listener never fetches the URL.** Even an approved host produces
  only a `202 ACKNOWLEDGED_NO_ACTION` response — no outbound request, no
  status inquiry, no payment mutation. This is enforced structurally (no
  `fetch`/`http.request`/`https.request`/`axios` call exists anywhere in
  the controller) and checked by `verify:apg-url-contract`.
- **MPGS remains commercially frozen**: `BANK_ALFALAH_MPGS_ENABLED` is
  untouched, still defaults `"false"`; nothing in this packet re-enables
  or modifies the MPGS gateway module.
- **No JazzCash/RAAST/COD/bank-transfer flow was invented.** This
  foundation is generically named "Bank Alfalah APG" per the owner's
  stated intent; no specific rail's protocol shape is assumed.

## 3. What remains `AWAITING_BANK_CONFIRMATION`

Per the task's explicit instruction, the following are **not implemented**
and must not be guessed:

- **Status inquiry** (the APG equivalent of MPGS's Retrieve Order).
- **Acknowledgement** requirements/format for the IPN listener.
- **Authentication** (how the bank authenticates itself to this listener,
  and how this server would authenticate to any bank-side status API).
- **Payment mutation** — no code path from either route ever reaches
  `applyVerifiedPaymentEvidence`.

See `docs/payments/R9_2_APG_REQUIREMENTS_MATRIX.md` for the full 13-row
matrix (unchanged from the freeze packet, carried forward).

## 4. SSRF prevention (exact mechanism)

`isAllowedApgCallbackUrl(rawUrl, allowedHostsCsv)` in
`apps/api/src/controllers/bank-alfalah-apg.controller.ts`:

1. Reject if `rawUrl` is missing/empty.
2. Parse with the WHATWG `URL` constructor; reject on parse failure
   (malformed).
3. Reject if `protocol !== "https:"`.
4. Split `allowedHostsCsv` into an exact hostname list; reject if empty
   (fail-closed default).
5. Reject unless `parsed.hostname` (the URL parser's own authoritative
   host, immune to userinfo/path/query tricks) is an exact match in the
   allowlist.
6. Only then return `allowed: true` — and even then, the caller never
   fetches the URL.

Proven by 9 unit tests
(`apps/api/src/controllers/bank-alfalah-apg.controller.test.ts`) including
two explicit SSRF-trick cases (embedded-host-in-path, userinfo host
confusion) and a static source-scan test confirming no network-call
primitive exists in the file.

## 5. `npm run verify:apg-url-contract`

12 checks, repository-configuration-and-source-only, zero external calls:
both exact routes present with correct HTTP methods and mounted; APG and
MPGS both default disabled; the APG allowlist defaults empty; the return
handler never calls `applyVerifiedPaymentEvidence` or writes a literal
`"PAID"`; the listener enforces exact (not loose) host matching and
rejects non-HTTPS; neither handler makes an outbound network call; the
frontend never reads URL query parameters or contains a fabricated-success
string; the `/payment/return` route is registered; no hardcoded
localhost/secret in the new files. All 12 pass on the real repository;
every check was proven against a temporary failing fixture then reverted.

## 6. Result

- Payment-free staging (upload → preview → pricing → `FixedOrder` →
  truthful checkout-unavailable message) remains fully proven and
  unaffected.
- Commercial launch remains blocked — this packet adds ingress plumbing
  only, no working payment path of any kind.
- Next step is entirely bank-dependent: once official APG documents
  arrive, the requirements matrix converts row-by-row from
  `AWAITING_BANK_CONFIRMATION` to a real, tested implementation — never
  guessed ahead of that.
