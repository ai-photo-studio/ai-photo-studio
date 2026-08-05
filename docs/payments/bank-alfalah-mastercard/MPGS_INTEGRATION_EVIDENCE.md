# Bank Alfalah Mastercard Gateway (MPGS) — Integration Evidence

**Status:** Sandbox-only. Not activated in production. No production credential exists in this repository, in any commit, or in any test.
**Packet:** R9.2-P4C-MPGS-SUPERSEDE-LEGACY-APG
**Date:** 2026-08-04

## 1. Owner decision

The previous "Alfa APG v1.1" merchant protocol/settings are **retired**. This
repository never actually had a working Alfa APG implementation (confirmed by
grep across source, config, env examples, deployment docs, tests, and the
canonical `.kilo/plans/commerceflownew.md` business spec, which records
`Bank Alfalah gateway: ❌ Not implemented`) — there was nothing live to
migrate off of, only the *possibility* of that protocol being introduced
later. This packet forecloses that path and establishes the Mastercard
Gateway (MPGS) sandbox at `test-bankalfalah.gateway.mastercard.com` as the
only Bank Alfalah integration this repository is permitted to carry.

Retired and forbidden anywhere in active code/config from this point forward:
`sandbox.bankalfalah.com`, `payments.bankalfalah.com`, `/HS/` endpoints,
Store ID / Key1 / Key2, `HS_`-prefixed fields, AES/CBC APG request
construction, and old APG return/IPN/status rules. Enforced by
`apps/api/src/services/p4c-bank-alfalah-legacy-apg-retired.test.ts` (a
repository-wide scan test).

## 2. Documentation source and confidence

`WebFetch` was attempted against the five official MPGS documentation URLs
supplied for this packet (Hosted Checkout integration model, Hosted Session
integration model, Retrieve Order v74 API reference, webhook notifications,
3DS test-your-integration). Every one of them returned only a client-rendered
JavaScript shell (a bare "Integration Guide" heading, no body content) — the
Mastercard Gateway documentation portal renders its content client-side and
is not fetchable by a plain HTTP GET.

Because of that, **every field name, endpoint shape, and flow step below is
marked `standard-pattern-fallback`**: it follows the well-established,
widely-documented Mastercard Gateway (MPGS) REST API v74 conventions used
across Mastercard-branded gateway deployments (Bank Alfalah's included, per
public integration guides from other MPGS-branded banks), not a live fetch of
this specific bank's rendered page. No field below is claimed
`doc-confirmed-live-fetch`.

| Item | Evidence |
|---|---|
| REST base path `/api/rest/version/{v}/merchant/{merchantId}/order/{orderId}` | standard-pattern-fallback |
| Hosted Checkout initiation: `PUT .../order/{orderId}/checkout`, `apiOperation: INITIATE_CHECKOUT` | standard-pattern-fallback |
| Retrieve Order: `GET .../order/{orderId}` | standard-pattern-fallback |
| REST auth: HTTP Basic, `merchant.<Merchant ID>` / API Password | standard-pattern-fallback |
| Webhook payload cannot be trusted without a live signing-secret test | standard-pattern-fallback (fail-safe assumption, not doc-confirmed) |
| API version `74` | as specified by the task; standard-pattern-fallback |

## 3. Authentication

- REST Basic Auth. **Username:** `merchant.<Merchant ID>` (literal prefix
  `merchant.` + the numeric/alphanumeric Merchant ID). **Password:** the API
  Password.
- `BANK_ALFALAH_MPGS_OPERATOR_ID` is **portal-login metadata only**. It is
  never used to build the REST Authorization header and is never sent to any
  MPGS REST endpoint by this codebase.
- Neither the Merchant ID nor the API Password nor the Operator ID is ever
  logged, returned in an HTTP response, or embedded in an error message.
  `getConfigPreview()` in `apps/api/src/config/env.ts` redacts any config key
  matching `/secret|token|key|password/i`; `BANK_ALFALAH_MPGS_API_PASSWORD`
  matches that pattern.

## 4. Configuration (apps/api/src/config/env.ts)

| Env var | Default | Notes |
|---|---|---|
| `BANK_ALFALAH_MPGS_ENABLED` | `false` | Fail-closed; gateway refuses to construct/operate unless `true` |
| `BANK_ALFALAH_MPGS_BASE_URL` | `https://test-bankalfalah.gateway.mastercard.com` | Sandbox only in this packet |
| `BANK_ALFALAH_MPGS_API_VERSION` | `74` | |
| `BANK_ALFALAH_MPGS_MERCHANT_ID` | *(empty)* | Required when enabled |
| `BANK_ALFALAH_MPGS_API_PASSWORD` | *(empty)* | Required when enabled; never logged |
| `BANK_ALFALAH_MPGS_OPERATOR_ID` | *(empty)* | Portal-login metadata only, not used for REST auth |
| `BANK_ALFALAH_MPGS_CHECKOUT_MODE` | `hosted_checkout` | Only supported value in this packet |

No real values for `BANK_ALFALAH_MPGS_MERCHANT_ID` / `_API_PASSWORD` /
`_OPERATOR_ID` are present anywhere in this repository. If/when the owner has
sandbox credentials available (GitHub Actions/repo secrets `API_PASSWORD`,
`MERCHANT_ID`, `OPERATOR_ID`, or equivalently-named `BANK_ALFALAH_MPGS_*`
secrets), a future session should load them **only** as process environment
variables for that one session — never written to `.env` — e.g.:

```
$env:BANK_ALFALAH_MPGS_ENABLED = "true"
$env:BANK_ALFALAH_MPGS_MERCHANT_ID = (gh secret list --json name | ... )  # or paste manually, never echo it
$env:BANK_ALFALAH_MPGS_API_PASSWORD = <loaded the same way, never echoed>
$env:BANK_ALFALAH_MPGS_OPERATOR_ID = <loaded the same way, never echoed>
```

or, following the existing `.env.example` precedent (a tracked template with
`replace_me` placeholders, never real values committed), a developer-local,
**gitignored** `.env.sandbox.local` could hold the real values for that
developer's own machine only — no such file exists yet in this repository and
none was created by this packet, since no credential value was available in
this session.

## 5. Flow implemented (`apps/api/src/services/p4c-bank-alfalah-mpgs-gateway.service.ts`)

1. **Initiate Hosted Checkout** — `PUT /api/rest/version/74/merchant/{merchantId}/order/{orderId}/checkout`,
   built ONLY from server-owned `FixedOrder`/`PaymentAttempt` values (order id,
   amount, currency). No client-supplied amount/currency/order id is ever
   accepted.
2. **Browser return** (`handleMpgsBrowserReturn`) — untrusted by design. It
   never marks a payment paid from the browser's own claim; it re-derives the
   stored attempt and always performs step 3 itself.
3. **Retrieve Order** (`GET /api/rest/version/74/merchant/{merchantId}/order/{orderId}`) —
   the only status-inquiry call this module makes, always targeting the
   configured `BANK_ALFALAH_MPGS_BASE_URL` with the stored, validated order
   id. Never fetches a URL taken from webhook content.
4. **Exact match** (`matchRetrievedOrderToAttempt`) — requires merchant id,
   order id, amount (minor units), currency, and a `PAID` status to all match
   the stored `PaymentAttempt` before anything is accepted.
5. **Apply** — on an exact match, calls the existing, unmodified
   `applyVerifiedPaymentEvidence` (P4A) transaction, which is the only place
   a `PaymentEvent`/entitlement/master/`QUEUED` `ReplicateExecution` is ever
   written. This module never calls Replicate, R2, or any worker.
6. **Webhook** (`handleMpgsWebhookTrigger`) — because webhook signature
   verification could not be confirmed against live documentation in this
   packet, the webhook payload is used ONLY to identify which order id to
   re-check; its content is never trusted for the payment decision. It always
   re-runs steps 3–5 itself.
7. **Idempotency** — `dedupeHash` is derived deterministically from
   `provider + gatewayOrderId + providerRef + amountMinor`, so a duplicate or
   concurrent verification (browser return racing a webhook trigger, or a
   replayed webhook) converges on the database's own unique constraints to
   exactly one `PaymentEvent`, entitlement, master, and `QUEUED`
   `ReplicateExecution` — proven in
   `p4c-bank-alfalah-mpgs-gateway.service.pg-race.test.ts`.

Neither the browser-return handler nor the webhook-trigger handler is wired
to an Express route or controller in this packet, matching the same
not-yet-routed pattern already established for `applyVerifiedPaymentEvidence`
(P4A) and the P4B worker runner. Wiring a live HTTP return/webhook route,
generating real Hosted Checkout sessions against the sandbox, and any
production activation remain separate, later, owner-authorized actions.

## 6. Currency support (independently gated)

| Currency | Status | Evidence |
|---|---|---|
| PKR | **Enabled** | `standard-pattern-fallback` — PKR is Bank Alfalah's home-market settlement currency and is the only currency paired with `Market.PAKISTAN` by the existing `validateMarketCurrencyPair` domain guard. |
| USD | **Fail-closed (rejected)** | No live-fetched documentation or bounded sandbox capability test confirmed USD settlement is actually enabled on this merchant sandbox account. `assertMpgsCurrencySupported("USD")` throws `MpgsCurrencyNotSupportedError`; `initiateHostedCheckout` and all verification paths reject USD attempts. This is a known limitation until the owner either supplies confirming documentation or authorizes a bounded live sandbox test. |

## 7. Rollback plan

- Set `BANK_ALFALAH_MPGS_ENABLED=false` (the default) — the gateway
  constructor throws `MpgsNotConfiguredError` on every method call, so no
  code path can reach the network.
- No route is registered, so there is nothing to un-route.
- Reverting this packet's commit removes the gateway/env/test files cleanly;
  it does not touch `p4a-payment-verified-execution-queue.service.ts`,
  `p4b-internal-worker-runner.service.ts`, or any P3A/P3B file.

## 8. Protected scope confirmation

- Zero references to Replicate, R2, or the P3A/P3B worker inside
  `p4c-bank-alfalah-mpgs-gateway.service.ts` or its tests (verified by grep —
  see the task report for the exact commands run).
- `applyVerifiedPaymentEvidence` (P4A) and the `ReplicateExecution` row shape
  it produces are unmodified; this packet only adds a caller that can invoke
  it after independent gateway verification.
- No RunPod/Local worker file was touched. RunPod remains frozen at
  `runpod-hybrid-v2-freeze-2026-08-02`.

## 9. Known limitations / next steps for the owner

1. USD is fail-closed pending confirming documentation or a bounded sandbox
   test.
2. No live sandbox smoke test was run in this packet (no `MERCHANT_ID`/
   `API_PASSWORD`/`OPERATOR_ID` — or `BANK_ALFALAH_MPGS_*` equivalents — were
   present as environment variables in this session). See the task report
   for the exact command to run one later.
3. No Express route/controller wiring exists yet for the browser-return or
   webhook handlers — this is a deliberate, minimal-surface choice matching
   the P4A/P4B precedent; wiring it is a separate follow-up.
4. Webhook signature/authenticity verification is not implemented (the
   payload is treated as an untrusted trigger only) because the official
   webhook-notifications doc could not be live-fetched in this packet. A
   future packet should add real signature verification once the exact
   header/algorithm is confirmed from documentation or the owner's merchant
   portal.

## 10. Final corrected sandbox session proof (2026-08-05)

One final, bounded MPGS sandbox request was sent after correcting the prior
overlong diagnostic order ID. This is failure evidence, not activation
authority.

| Field | Recorded value |
|---|---|
| UTC / Pakistan time | `2026-08-05T13:01:16.489Z` / `2026-08-05T18:01:16.498` |
| DNS and connected IP | `216.119.223.23` |
| TLS subject / issuer | `CN=test-bankalfalah.gateway.mastercard.com`, MasterCard International Incorporated / DigiCert Global G2 TLS RSA SHA256 2020 CA1 |
| Method and path | `POST /api/rest/version/100/merchant/TESTGLOBALINDUS/session` |
| Request facts | API `100`, `INITIATE_CHECKOUT`, `PURCHASE`, PKR `1.00`, `text/plain` |
| Diagnostic order | `BAF260805130116E632`, length `19`, alphanumeric only; valid under the required 10-30 and below-41 limits |
| HTTP result | `401`, `application/json;charset=ISO-8859-1`, curl exit `0` |
| Timing | connect `0.560152s`, TLS appconnect `0.921900s`, total `1.443799s` |
| Session result | No `session.id` and no `successIndicator` returned |

Complete sanitized response JSON:

```json
{"error":{"cause":"INVALID_REQUEST","explanation":"Invalid credentials."},"result":"ERROR"}
```

The prior `400` was solely an `order.id` length validation error on a
42-character diagnostic ID. The corrected 19-character PURCHASE request
removes that local defect. The remaining `401` means neither successful MPGS
sandbox authentication nor successful `POST /session` initiation is verified.
No retry was made. The only next Bank Alfalah action requested is confirmation
of the exact remaining action: credential reset, profile permission, or the
correct endpoint. The exposed API password must be rotated/reissued before any
future attempt. `BANK_ALFALAH_MPGS_ENABLED` remains `false`; no product or
gateway adapter change is authorized by this result.

Sanitized, visually checked evidence PNGs are retained outside the repository:

- `D:\Temp\claude\evidence\baf-final-request-response.png`
- `D:\Temp\claude\evidence\baf-final-conclusion.png`

No card data, capture, production action, Replicate, R2, RunPod, webhook, or
additional gateway request occurred. Temporary request, response, header, and
render-source files were deleted after the PNG evidence was created.
