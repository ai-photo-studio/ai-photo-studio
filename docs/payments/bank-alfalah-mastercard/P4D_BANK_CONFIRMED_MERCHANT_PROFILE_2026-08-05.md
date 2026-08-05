# Bank Alfalah MPGS — Bank-Confirmed Merchant Profile Facts (R9.2-P4D)

**Status:** Bank-confirmed facts recorded. Sandbox authentication has **not**
yet been re-attempted with these facts as of this document's creation (see
`P4C_SANDBOX_SMOKE_EVIDENCE.md` for the prior `404` failure this packet
follows up on). No Merchant ID, API Password, Operator ID, or any other
secret value is recorded anywhere in this document.
**Packet:** R9.2-P4D-MPGS-SANDBOX-AUTH
**Date:** 2026-08-05

## 1. Facts confirmed directly by Bank Alfalah (owner-reported, this session)

1. A **complete, bank-issued 15-character Merchant ID** is active in the
   MPGS sandbox for this merchant profile.
2. **Hosted Checkout / API access is enabled** for this merchant profile.
3. The confirmed integration is **API V100** with
   `apiOperation=INITIATE_CHECKOUT` (see §2 below — this repository's code
   and prior evidence assumed API version `74`; this is a material,
   bank-confirmed correction).
4. The **same credentials** (Merchant ID + API Password) are valid for
   **both PKR and USD sandbox testing** on this merchant profile.
5. The **Operator ID** is explicitly for **MPGS portal login only** — this
   matches this repository's existing, unchanged rule that
   `BANK_ALFALAH_MPGS_OPERATOR_ID` is never used for REST authentication.
6. A **webhook endpoint must be supplied** by this integration to the bank
   (not yet supplied as of this document).
7. The bank has supplied **webhook source IP(s)** that will originate
   webhook calls. *(Owner: the exact IP address(es) provided by Bank Alfalah
   were not included in the task text handed to this agent session — record
   them here verbatim before relying on any source-IP allowlist. No webhook
   route exists in this repository yet in any case; see
   `p4c-bank-alfalah-mpgs-gateway.service.ts`'s trust-boundary note — no
   webhook state mutation happens until payload format/authentication is
   documented, per task rule 5.)*

   **Webhook source IP(s):** _TO BE FILLED IN BY OWNER — not supplied to this
   agent session. Do not infer, guess, or leave blank in production
   configuration; this placeholder must be replaced with the bank's literal
   values before any webhook allowlist is enforced._
8. The bank states that **allowlisting, 3DS, and return-URL configuration
   are aligned** for this merchant profile (i.e., the bank asserts no
   further bank-side configuration is outstanding on those three items).

## 2. Material correction: API version 74 -> V100

Every prior packet in this directory (`MPGS_INTEGRATION_EVIDENCE.md`,
`P4C_SANDBOX_SMOKE_EVIDENCE.md`, `P4C2_CREDENTIAL_PROVISIONING_RESOLUTION.md`)
recorded API version `74` as `standard-pattern-fallback` evidence (never
`doc-confirmed-live-fetch`), because the MPGS documentation portal only
returned a client-rendered JS shell to a plain GET. The bank has now
**directly confirmed** `API V100` for this merchant profile. This is a
plausible root cause — independent of and in addition to any Merchant-ID
question — for the prior sandbox smoke test's structural `HTTP 404`: a v74
REST path (`/api/rest/version/74/...`) sent to a merchant profile
provisioned for `V100` is exactly the shape of request a real MPGS gateway
would 404 (path/version mismatch presents as "not found", not as a
401/403 auth challenge), independent of whether the Merchant ID or API
Password were otherwise correct.

`BANK_ALFALAH_MPGS_API_VERSION` is already an environment-driven config
value in this repository (`apps/api/src/config/env.ts`,
`BANK_ALFALAH_MPGS_API_VERSION`, default `"74"`) — the code needs no
structural change, only the correct value supplied at dispatch time. This
packet updates the default to `"100"` (see the P4D auth-verification
work in this same commit) and the sandbox smoke script/workflow to use it.

## 3. Merchant ID length: 15 characters, not 12 — exact interpretation

Generic MPGS documentation states `merchantId` may be **up to 12
characters**. Bank Alfalah has directly confirmed this specific merchant's
**actual, bank-issued Merchant ID is 15 characters**. Per this task's
explicit instruction, this repository:

- treats the bank's direct, merchant-specific confirmation as authoritative
  over generic third-party MPGS documentation for this integration,
- uses the **exact configured 15-character ID first**, unmodified, in both
  the REST path (`.../merchant/{merchantId}/...`) and the Basic Auth
  username (`merchant.<merchantId>`),
- will **never truncate, pad, derive, or guess** a 12-character substring or
  variant of the configured ID under any circumstance,
- if the exact 15-character ID is rejected specifically because of
  identifier length or "merchant not recognized" (see
  `docs/payments/bank-alfalah-mastercard/P4D_SANDBOX_AUTH_VERIFICATION.md`
  for the dispatch result), this repository stops and produces an exact
  Bank Alfalah follow-up question (see that document's follow-up section)
  asking whether a **separate, shorter (<=12 character) gateway Merchant
  ID** exists that must be used in the URL/username instead of the
  15-character ID — it never tests a guessed substring against the live
  sandbox to find out.

## 4. What this packet does NOT change

- No Merchant ID, API Password, or Operator ID value is recorded here or
  anywhere in source control.
- No production credential, production URL, or production activation.
- No card data, no capture, no Replicate/R2/RunPod call.
- No webhook route is wired (payload format/authentication remains
  undocumented; see task rule 5).
- No checkout/customer-route code changes are made by this document alone —
  those are conditional on the sandbox authentication result recorded in
  `P4D_SANDBOX_AUTH_VERIFICATION.md`.
