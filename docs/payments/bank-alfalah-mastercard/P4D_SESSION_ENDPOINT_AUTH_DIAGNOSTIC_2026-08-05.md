# Bank Alfalah MPGS — Session-Endpoint Auth Diagnostic (R9.2-BAF-MPGS-EXACT-DIAGNOSTIC)

**Status:** `P4C_MPGS_AUTH_VERIFIED` still **NOT achieved**. Root cause narrowed
from a structural `404` (every prior P4C/P4D packet, on
`PUT .../order/{orderId}/checkout`) to a genuine, disambiguated `401`
credential rejection on `POST .../session` under API V100 with the exact,
untruncated 15-character Merchant ID. No card data, no capture, no
Replicate/R2/RunPod call. No product code was modified by this packet.
**Packet:** R9.2-BAF-MPGS-EXACT-DIAGNOSTIC
**Date:** 2026-08-05
**Superseded/extended by:** `P4D_MPGS_FINAL_LOCAL_INVESTIGATION_2026-08-05.md`
(same date, follow-up session) — that document independently reconfirms this
one's `401` finding across two more endpoint shapes and adds a new, separate
structural lead. This document's content is preserved unmodified as the
original record.

## 1. What changed from every prior packet

Prior evidence (`P4D_SANDBOX_AUTH_VERIFICATION.md`, `P4C_SANDBOX_SMOKE_EVIDENCE.md`)
tested only the shape this repository's code implements:
`PUT .../api/rest/version/{ver}/merchant/{merchantId}/order/{orderId}/checkout`,
and always received a structural `HTTP 404` — indistinguishable from a
routing or merchant-provisioning problem.

This packet's owner-provided task specified testing a **different** MPGS
endpoint shape instead: `POST .../api/rest/version/100/merchant/{merchantId}/session`
with `interaction.operation=AUTHORIZE`. This was tested by raw `curl.exe`,
outside of and without modifying `p4c-bank-alfalah-mpgs-gateway.service.ts`
(which still implements the `/order/{id}/checkout` shape only).

## 2. Sanitized request/result

| Field | Value |
|---|---|
| Resolved host/IP | `test-bankalfalah.gateway.mastercard.com` → `216.119.223.23` |
| Method / URL | `POST .../api/rest/version/100/merchant/[MID]/session` (byte-verified: 101 chars, no trailing character) |
| Merchant ID length | 15 (exact, untruncated; value not repeated here) |
| `apiOperation` | `INITIATE_CHECKOUT` |
| `interaction.operation` | `AUTHORIZE` |
| Order | synthetic, unique `bafdiag-*` id, PKR `1.00` |

**First attempt (A: `text/plain`, B: `application/json`, C: deliberately wrong
password)** — all three: `HTTP 400`,
`{"error":{"cause":"INVALID_REQUEST","explanation":"Json encoded payload error: Unexpected character 'a' at [character 14 line 1]"},"result":"ERROR"}`.
This was a client-side defect, not a gateway signal: passing a
double-quoted JSON string as a `curl.exe --data` argument through
PowerShell strips/mangles the quotes before curl transmits it. Repaired by
writing the body to a file and sending it via `--data @file` (bypasses
PowerShell's argument requoting entirely).

**Repaired rerun (A, B, C)** — all three: `HTTP 401`,
`{"error":{"cause":"INVALID_REQUEST","explanation":"Invalid credentials."},"result":"ERROR"}`,
**byte-identical** between the owner-supplied password (A, B) and a
deliberately wrong control password (C). No `WWW-Authenticate` header, no
correlation/request/support-id header on any response. Response
`Content-Type`: `application/json;charset=ISO-8859-1` throughout. `curl`
exit code `0` on all six requests; timings 1.1–2.7s.

## 3. Interpretation

Per this task's own interpretation rubric, `401` classifies as an **API
authentication/password/permission problem** — a materially different and
more specific failure than the `404` every prior packet recorded. Reaching
`/session` under V100 with the full, untruncated 15-character Merchant ID
produced a real, distinguishable gateway response (not a generic
not-found), which independently reconfirms the Merchant-ID-length
hypothesis is not the blocker on this endpoint either.

Because the supplied password and a deliberately wrong control password
produced byte-identical `401` responses, this session cannot determine from
the gateway's response alone whether the supplied password is wrong,
stale, not yet provisioned for this endpoint, or lost a character in
transcription — only the owner/bank can resolve which. The received
password string was independently confirmed to be 32 characters (a
plausible MPGS-generated length) without ever displaying its value.

## 4. Exact Bank Alfalah follow-up required (verbatim)

> "Testing `POST /api/rest/version/100/merchant/TESTGLOBALINDUS/session`
> (Basic Auth, username `merchant.TESTGLOBALINDUS`) with the API Password on
> file for this sandbox merchant profile returns `HTTP 401
> {"error":{"cause":"INVALID_REQUEST","explanation":"Invalid credentials."}}`
> — identically whether the exact configured password or a deliberately
> wrong one is used, so the two cannot be distinguished from the response
> alone. (1) Can you confirm/reissue the exact current API Password for
> merchant `TESTGLOBALINDUS` on this V100 sandbox profile? (2) Is
> `POST .../merchant/{merchantId}/session` the correct, currently-intended
> integration endpoint for this profile, or should Hosted Checkout's
> `PUT .../merchant/{merchantId}/order/{orderId}/checkout` (the shape
> already implemented in this repository) be used instead?"

## 5. PR #133 post-hoc DB/browser verification (same session)

PR #133 (`feat/r9.2-p4d-checkout-foundation`) was found already merged on
GitHub (`bda4fa3`, `1b6f60c5fee008b9d6e4e5baaca167cd61c5affb`, 0 CI checks
run) before this session started. This packet performed the missing
verification post-hoc in an isolated git worktree against a disposable
local PostgreSQL 17 instance (never the persistent service):

- **37/37 DB-level checks passed**: `customer-checkout.service.test.ts`
  (1/1), `fixed-order.service.pg-race.test.ts` (16/16),
  `p4c-bank-alfalah-mpgs-gateway.service.pg-race.test.ts` (6/6),
  `p4a-payment-verified-execution-queue.service.pg-race.test.ts` (14/14).
- **52/52 Playwright browser tests passed** (`test:browser`, full suite).
  No spec exists yet for the new checkout endpoint because PR #133 changed
  no `apps/web` files — this is a clean no-regression result, not new
  coverage.
- Cleanup proven: disposable Postgres PID gone, port free, persistent
  `postgresql-x64-17` service confirmed untouched, temp directory deleted,
  git worktree removed.
- **Coverage gap found and recorded** (not fixed by this packet, per
  "no product code changed" scope): PR #133's own test
  (`customer-checkout.service.test.ts`) does not exercise Prisma, the
  gateway, or any race condition; no dedicated pg-race test exists yet for
  `customer-checkout.service.ts`'s new checkout-creation path.

## 6. Protected-scope confirmation

- No card data was ever constructed or sent.
- No payment capture/transaction occurred.
- No Replicate, R2, or RunPod/worker call was made.
- No legacy `sandbox.bankalfalah.com`/`/HS/` endpoint was touched.
- No Merchant ID, API Password, or Operator ID value is recorded anywhere
  in this document or committed to source control; the password was held
  only in a process-scoped environment variable for the duration of the
  diagnostic and was never printed, logged, base64-displayed, or written to
  any file.
- No checkout/customer-route code was added or modified as a result of this
  failed authentication.
- `BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED` is retained, not
  retired.
