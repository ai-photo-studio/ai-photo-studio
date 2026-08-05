# Bank Alfalah MPGS — PURCHASE Final Test And Evidence (R9.2-BAF-PURCHASE-FINAL-TEST-AND-EVIDENCE)

**Status:** No session created — **not** a SUCCESS. However, this is the
most encouraging result this investigation has produced: the response is a
specific field-level business-validation error (`order.id` too long),
structurally different from every prior `401 Invalid credentials` response
in this repository's evidence, consistent with the request having passed
authentication and JSON parsing this time. `P4C_MPGS_AUTH_VERIFIED` is
**still not achieved** (no `session.id`/`successIndicator` was returned).
`BANK_ALFALAH_MPGS_ENABLED` remains `false`. No product/gateway code was
changed.
**Packet:** R9.2-BAF-PURCHASE-FINAL-TEST-AND-EVIDENCE
**Date:** 2026-08-05
**Screenshot (outside repository, for email attachment):**
`D:\Temp\claude\evidence\baf-purchase-final-evidence.png`

## 1. Authority read

Per this session's task, the owner reported the bank's latest email requires
`interaction.operation="PURCHASE"` (not `AUTHORIZE`, used in the immediately
prior session) and supplied an exact request shape including
`interaction.merchant.name: "Global Industrial Suppliers"`. No literal bank
email file exists anywhere in this repository — this is owner-reported
content, recorded here verbatim as received. All prior
`docs/payments/bank-alfalah-mastercard/*.md` evidence, the current
`p4c-bank-alfalah-mpgs-gateway.service.ts` source/tests, and the retired
legacy-APG scan were re-confirmed consistent with this task's constraints
(MPGS only, never legacy `sandbox.bankalfalah.com/HS`).

## 2. The one live sandbox request

**Request** (byte-exact, per task specification):

- `POST https://test-bankalfalah.gateway.mastercard.com/api/rest/version/100/merchant/TESTGLOBALINDUS/session`
- `Content-Type: text/plain`
- Basic Auth: username `merchant.TESTGLOBALINDUS`, password = the exact
  supplied API password (never printed, never logged; held only in a
  process-scoped PowerShell variable, cleared after use)
- Body: `{"apiOperation":"INITIATE_CHECKOUT","interaction":{"operation":"PURCHASE","merchant":{"name":"Global Industrial Suppliers"}},"order":{"currency":"PKR","amount":"1.00","id":"<unique>","description":"Bank Alfalah sandbox checkout test"}}`
- Sent via `curl.exe --user ... --data-binary @file` (body written to a
  temp file first, never inlined as a `curl` argument).

**Result:**

| Field | Value |
|---|---|
| Timestamp (UTC) | `2026-08-05T12:29:55Z` |
| DNS-resolved IP | `216.119.223.23` |
| TLS | Handshake completed — real certificate chain: `CN=test-bankalfalah.gateway.mastercard.com`, `O=MasterCard International Incorporated`, issued by DigiCert; `time_appconnect=0.9708s > time_connect=0.5980s` proves the TLS handshake itself completed (not just a TCP connect) |
| Method / exact path | `POST /api/rest/version/100/merchant/TESTGLOBALINDUS/session` |
| API version | `100` |
| `interaction.operation` | `PURCHASE` (exactly as bank-specified) |
| Merchant ID length | 15 (exact, unmodified) |
| HTTP status | `400` |
| Response Content-Type | `application/json;charset=ISO-8859-1` |
| `WWW-Authenticate` | none |
| Correlation/Request/Support-ID header | none (only an internal APM `traceresponse` header, not a support ID) |
| `curl` exit code | `0` |
| Timing | connect `0.598s` / TLS-appconnect `0.971s` / total `1.398s` |

**Complete response body (verbatim):**

```json
{"error":{"cause":"INVALID_REQUEST","explanation":"Value 'baf-purchase-final-20260805172955-cb05fd12' is invalid. Length is 42 characters, but must be less than 41","field":"order.id","validationType":"INVALID"},"result":"ERROR"}
```

## 3. Procedural note: a first attempt did not complete

A first invocation of the request-construction script failed locally
(PowerShell's own handling of a benign `curl` stderr note — `"Note:
Unnecessary use of -X or --request, POST is already inferred"` — raised a
terminating error in this environment before the script's own logic could
run to completion). The resulting header file was empty (no response
received) and the verbose capture file was **0 bytes** — no `curl`
connection-phase output ("Trying...", DNS, TLS) was ever written, which is
the earliest possible verbose signal `curl` emits. This is strong evidence
no network round-trip occurred on that first attempt, though it cannot be
stated as an absolute, provable certainty. Per this task's "no ... second
live request" rule, this is disclosed transparently rather than treated as
license for a intentional retry: only the one request described in §2 above
produced a real, evidenced HTTP response, and no further live request was
made after it.

**Incidental exposure, disclosed and remediated:** while investigating this
first attempt's leftover temp file, this session's own diagnostic
process printed the full `Authorization: Basic <base64>` header (containing
the exact API password) to the operator's own terminal/transcript once,
before the mistake was caught. The offending temp file was deleted
immediately. **The current API Password for `merchant.TESTGLOBALINDUS`
should be treated as exposed and should be rotated/reissued by Bank
Alfalah as a precaution**, independent of this packet's other findings.

## 4. Interpretation

This `400` response is structurally different from every `401 Invalid
credentials` response recorded in
`P4D_MPGS_FINAL_LOCAL_INVESTIGATION_2026-08-05.md` (same credentials, same
Basic Auth username, same `/session` endpoint): it carries `"field"` and
`"validationType"` keys that only appear once the gateway has parsed the
request body into a business object and validated a specific field —
`order.id` exceeding what appears to be an approximately 40-character
limit. Reaching this stage is consistent with (though not a directly
confirmed fact from Mastercard/Bank Alfalah) the request having passed HTTP
Basic authentication and JSON parsing this time, using
`interaction.operation="PURCHASE"` instead of the `"AUTHORIZE"` value used
in the immediately prior session (which always produced the generic
credential-rejection message). No session was created; this remains
**not** a SUCCESS. The concrete, fully client-side, fully fixable defect is
that the synthetic diagnostic order id used here was one character over the
apparent limit.

## 5. Draft Bank Alfalah reply (NOT sent — prepared for the owner's review only)

> Subject: Bank Alfalah MPGS Sandbox — PURCHASE test result for merchant TESTGLOBALINDUS
>
> Thank you for confirming `interaction.operation="PURCHASE"` for this
> merchant profile. We ran exactly one live sandbox request using that
> value, via `POST /api/rest/version/100/merchant/TESTGLOBALINDUS/session`
> (API version 100, `Content-Type: text/plain`, Basic Auth username
> `merchant.TESTGLOBALINDUS`), with `interaction.merchant.name` set to
> "Global Industrial Suppliers" as specified.
>
> The gateway responded with `HTTP 400` and a specific field-validation
> error — not the generic "Invalid credentials" message our prior sandbox
> tests received — indicating the request reached real business-object
> validation:
>
> `{"error":{"cause":"INVALID_REQUEST","explanation":"Value '...' is
> invalid. Length is 42 characters, but must be less than 41",
> "field":"order.id","validationType":"INVALID"},"result":"ERROR"}`
>
> This appears to be a client-side defect on our end (our diagnostic
> order id was one character over what looks like a 40-character limit),
> not a gateway or connectivity problem — the TLS handshake completed
> successfully against your certificate (attached screenshot,
> password/Authorization redacted) and the response was a well-formed JSON
> business-validation error, not an HTML error page, a timeout, or a
> generic network failure.
>
> To close this out, could you please:
> 1. Confirm the maximum length for `order.id` on this integration (we
>    inferred ~40 characters from the message above);
> 2. As a precaution, confirm or reissue the API Password for
>    `merchant.TESTGLOBALINDUS` on this sandbox profile (an internal
>    diagnostic process on our side inadvertently displayed our own
>    Authorization header once during this session, so we are treating
>    that password as exposed regardless of today's result); and
> 3. Confirm whether `POST /session` (used here) is the correct,
>    sole integration entry point for this profile, or whether
>    `PUT /order/{id}/transaction` should be used instead for our
>    Hosted Checkout flow.
>
> Screenshot attached: sanitized request/response summary (no password or
> Authorization header included).

## 6. Protected-scope confirmation

No card data, no capture, no live financial transaction, no production
credential enablement, no legacy `sandbox.bankalfalah.com`/`/HS/` endpoint
touched, no RunPod/Replicate/R2 call, no checkout/customer-route or gateway
code change. Exactly one completed live sandbox HTTP request this session
(plus one client-side-only failed attempt with no evidenced network
completion, disclosed above). `BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED`
is retained, not retired. `BANK_ALFALAH_MPGS_ENABLED` unchanged (`false`).
