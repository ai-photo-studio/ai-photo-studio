# Bank Alfalah MPGS — Sandbox Auth Verification (R9.2-P4D)

**Status:** `P4C_MPGS_AUTH_VERIFIED` **NOT achieved**. `BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED` remains open, now narrowed by a new, real dispatch under the bank-confirmed API V100 and the exact 15-character Merchant ID. No card data, no capture, no Replicate/R2/RunPod call.
**Packet:** R9.2-P4D-MPGS-SANDBOX-AUTH
**Date:** 2026-08-05

## 1. What ran

Workflow: `.github/workflows/bank-alfalah-mpgs-sandbox-smoke.yml`, `workflow_dispatch`, dispatched against `feat/r9.2-p4d-mpgs-sandbox-auth` after this packet's code changes (API version `100`, exact 15-character Merchant ID, USD gated to run only after PKR succeeds).

| Run | Ref | Result | Exit code |
|---|---|---|---|
| [`30987873211`](https://github.com/ai-photo-studio/ai-photo-studio/actions/runs/30987873211) | `feat/r9.2-p4d-mpgs-sandbox-auth` | `failure` | `3` (merchant-id length/recognition stop, per script design — see §4) |

## 2. Sanitized request/result (PKR leg — the only leg attempted)

All fields below are exactly what the smoke script printed; no secret value was ever in scope to redact.

| Field | Value |
|---|---|
| Merchant ID length | **15** (value never printed; confirms the exact 15-character bank-issued ID was used, unmodified — not truncated to 12) |
| API version | `100` |
| `apiOperation` | `INITIATE_CHECKOUT` |
| HTTP method / endpoint shape | `PUT .../api/rest/version/100/merchant/{merchantId}/order/{orderId}/checkout` |
| HTTP status | **404** |
| Content-Type | `application/json;charset=ISO-8859-1` |
| WWW-Authenticate | `none` (gateway did not return this header) |
| Correlation/request ID | `none` (gateway did not return `x-correlation-id`, `x-request-id`, or `x-mastercardapi-request-id`) |
| Synthetic test order id | `p4d-sandbox-smoke-pkr-2fc56487-5579-4fff-b628-f834ad4da886` (non-customer, no card data, no capture) |

Retrieve Order (`[2/2]`) was never reached — the flow stops on the first failure, and USD was never attempted, since USD is gated to run only after PKR succeeds.

## 3. Interpretation

The result is **unchanged in shape** from the prior P4C attempt (`P4C_SANDBOX_SMOKE_EVIDENCE.md`, run `30910714515`): a structural `404`, not a `401`/`403`. This session's two corrections — API version `74` -> bank-confirmed `100`, and confirming the full, untruncated 15-character Merchant ID was used exactly as configured — did **not** change the outcome. This rules out (as the sole cause) the API-version mismatch theorized in `P4D_BANK_CONFIRMED_MERCHANT_PROFILE_2026-08-05.md` §2, and is consistent with, though does not conclusively prove, the Merchant-ID-length/recognition explanation already flagged by generic MPGS documentation (`merchantId` up to 12 characters) as a plausible cause of the merchant-scoped path (`/merchant/{merchantId}/...`) not resolving.

No new response header (`WWW-Authenticate`, correlation-id) was available to disambiguate a credential problem from a merchant-recognition problem — the gateway's `404` response carries none of these on this endpoint, which itself is informative: MPGS typically returns `WWW-Authenticate` only on a `401`, so its absence here is consistent with (not proof of) a routing/recognition failure rather than a rejected credential.

## 4. Per task instruction: stop, do not guess

Per the explicit task rule ("When the exact 15-character ID is rejected because of identifier length or merchant recognition, stop. Do not test guessed 12-character substrings."), this session **stopped** at this result. No truncated, padded, or derived Merchant ID was constructed or sent. The smoke script enforces this automatically (exit code `3`) and prints the exact follow-up question below.

## 5. Exact Bank Alfalah follow-up (verbatim, as produced by the smoke script)

> "Our MPGS sandbox merchant profile has a bank-issued 15-character Merchant ID, but the Hosted Checkout / Retrieve Order REST calls using `merchant.<15-character-ID>` as the Basic Auth username and the same ID in the `/merchant/{merchantId}/` URL path segment are rejected with an HTTP 404 under API V100. Generic MPGS documentation states `merchantId` may be up to 12 characters. Is there a SEPARATE, shorter (<=12 character) gateway Merchant ID — distinct from the 15-character ID — that must be used in the URL path and the `merchant.<merchantId>` Basic Auth username instead of the 15-character ID? If so, please supply that exact gateway Merchant ID."

Additional items still open from the prior P4C2 packet's escalation list (`P4C2_CREDENTIAL_PROVISIONING_RESOLUTION.md` §6) that remain relevant and unresolved by this session's new facts:
- A working sanitized `curl`/Postman reference request for Hosted Checkout initialization against this exact merchant's sandbox (with the bank's own placeholder values), so the exact expected request shape/identifier can be diffed against this repository's implementation.
- Server-side gateway log lookup for this run's timestamp (`2026-08-05T08:09:55Z`, run `30987873211`), since no client-visible correlation ID was returned.

## 6. Authentication status

**`P4C_MPGS_AUTH_VERIFIED`: NOT achieved.** Both required legs (authenticated `INITIATE_CHECKOUT` and `retrieveOrder`) must succeed before that marker can be set; `INITIATE_CHECKOUT` itself did not succeed. `MERCHANT_PROFILE_ENABLEMENT_REQUIRED` is retained, not retired, per task rule 5 ("When authentication fails, make no checkout/customer-route changes").

## 7. PKR / USD state

- **PKR:** code-level `enabled: true` (unchanged); evidence remains `standard-pattern-fallback` for the protocol shape. **Not** `SANDBOX_VERIFIED` — this session's real dispatch still did not succeed.
- **USD:** code-level `enabled: true` for sandbox-testing purposes only (bank-confirmed same credentials as PKR — see `P4D_BANK_CONFIRMED_MERCHANT_PROFILE_2026-08-05.md`). **Not attempted** this session (gated behind PKR success, which did not occur) and **not** `SANDBOX_VERIFIED`.

## 8. Protected-scope confirmation

- No card data was ever constructed or sent.
- No payment capture/transaction occurred.
- No Replicate, R2, or RunPod/worker call was made.
- The workflow ran on `workflow_dispatch` only, against the hardcoded sandbox origin, with concurrency 1 and a 10-minute timeout.
- No secret value (Merchant ID, API Password, Operator ID) was printed, logged, or committed anywhere in this evidence — only presence booleans and a length count.
- No checkout/customer-route code was added or modified as a result of this failed authentication (task rule 5).
