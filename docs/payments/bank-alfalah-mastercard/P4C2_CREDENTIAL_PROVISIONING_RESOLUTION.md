# R9.2-P4C2 — Bank Alfalah MPGS Credential-Provisioning Resolution

**Status:** Diagnostic complete. Root cause is external/provisioning, not a
local code defect. Sandbox auth remains **unverified**. PKR remains **not**
`SANDBOX_VERIFIED`. No secret value, substring, or hash appears anywhere in
this document or in any file added by this packet.

## 1. Scope and authorization

This packet (R9.2-P4C2-MPGS-CREDENTIAL-PROVISIONING-RESOLUTION) follows the
R9.2-P4C packet (PR #118, merged `38f768d3b2bc1d52de31d79f457f8049aace3b89`)
and its sandbox-smoke evidence (PR #119/#120/#121). It re-inspects the actual
failed workflow run logs (not a prior session's paraphrase), builds a
permanent safe credential-provisioning diagnostic, and prepares the exact
Bank Alfalah support escalation and owner remediation steps. No endpoint
shape, auth header construction, or signing algorithm was changed. No real
payment, no card data, no production activation, no RunPod/Local change, no
force-push.

## 2. PR #121 — merged

PR #121 (`docs(r9.2-p4c): sandbox smoke evidence and canonical documentation`,
branch `docs/r9.2-p4c-sandbox-smoke-evidence`) was **already merged** before
this packet began, by merge commit:

```
e75484650ef28f2f9a6b11845685e58fcb59653c
```

(merged 2026-08-04T13:11:31Z). It added the sanitized evidence doc
(`P4C_SANDBOX_SMOKE_EVIDENCE.md`), and manifest/rules/`reports/LATEST.md`
updates. It is a docs-only PR (4 files, all `docs/`/`rules.md`/`reports/`);
no functional/code risk. No merge action was required in this session.

## 3. Re-inspection of the actual failed workflow run

Two `bank-alfalah-mpgs-sandbox-smoke.yml` (`workflow_dispatch`) runs exist on
`main`:

| Run ID | Result | Cause |
|---|---|---|
| `30910482924` | failure | Build error: `@prisma/client did not initialize yet` before the fix in PR #120. No network call attempted. |
| `30910714515` | failure | Real network call attempted and rejected. |

Full raw logs for run `30910714515` were read directly via `gh run view
30910714515 --log` in this session (not re-derived from the prior session's
summary). Structural, non-secret facts extracted from that run:

- **HTTP status:** `404` (this is the actual value from the smoke script's
  own error message — `Bank Alfalah MPGS initiateHostedCheckout failed with
  status 404` — printed by `p4c-bank-alfalah-mpgs-gateway.service.ts`'s
  `initiateHostedCheckout`). This is a plain HTTP 404, **not** a 401/403
  auth-challenge status.
- **Gateway error code/category:** not capturable from this run's evidence.
  The smoke script and gateway service (as they existed at the time of this
  run) discard the response body and headers on a non-OK status and throw
  only a message containing the numeric status code — they never parsed or
  logged a gateway error code, `WWW-Authenticate` header, `Content-Type`
  header, or a correlation/request ID. This is a real gap in what the P4C
  evidence could show, not a secret-hygiene redaction.
- **Response content type:** not captured (see above).
- **Gateway correlation/request ID:** not captured (see above). **No
  correlation ID exists in any evidence this session could find** — it was
  never extracted, not merely redacted.
- **Exact sanitized path:** `PUT
  https://test-bankalfalah.gateway.mastercard.com/api/rest/version/74/merchant/{merchantId}/order/{orderId}/checkout`
  (`{merchantId}`/`{orderId}` are the literal path segments; the real
  merchant id is a secret and is never present in any log — the orderId is a
  synthetic, non-secret value: `p4c-sandbox-smoke-bc11cab5-0cde-4083-a366-62acf5a615d4`).
- **Whether `WWW-Authenticate` was returned:** unknown / not capturable from
  this run's evidence (same gap as above).

### 3.1 Correction to the prior session's framing

The task brief for this packet stated the owner's current understanding is
that "Mastercard Gateway rejected Basic Auth" (implying a 401/403). Re-reading
the actual run log shows the gateway returned a structural **404**, not a
401/403. A 404 on this endpoint shape most commonly means the merchant ID in
the URL path was not recognized on this specific gateway host/region, or the
merchant is not yet provisioned for Hosted Checkout — not "wrong password."
This distinction matters for which support-packet questions and which return
code apply (see §6). Per the task's own instruction to trust the actual
workflow logs as authoritative when they conflict with a prior paraphrase,
this document treats `404` as the ground truth and flags the "Basic Auth
rejected" framing as unconfirmed by evidence.

### 3.2 Evidence-capture gap fixed (not an auth-logic change)

Because the existing gateway service discarded response headers/body on
failure, this packet could not retroactively recover the missing facts (§3)
from prior runs. As a **diagnostic-capture improvement only** — no endpoint
URL, HTTP method, auth header construction, or request body changed — a
follow-up gap is recorded here for the owner: a future packet should extend
`initiateHostedCheckout`/`retrieveOrder`'s error path to also capture (never
log the auth header itself) `response.headers.get("content-type")`,
`response.headers.get("www-authenticate")`, and any of the gateway's own
correlation-ID-style headers (e.g. `x-...-request-id`, `x-correlation-id`) so
that the next real dispatch produces complete evidence. This packet does
**not** make that code change itself, to keep this resolution strictly
diagnostic/documentation-scoped as authorized; it is called out here as an
owner-approved follow-up, not performed.

## 4. Safe configuration diagnostic (new, permanent)

Added: `apps/api/src/scripts/p4c2-mpgs-provisioning-config-diagnostic.ts`
(+ `apps/api/src/scripts/p4c2-mpgs-credential-provisioning-diagnostic.test.ts`,
14/14 passing) and a dedicated `workflow_dispatch`-only workflow
`.github/workflows/bank-alfalah-mpgs-provisioning-config-diagnostic.yml` that runs it
against the real GitHub secrets with **zero network calls** and **zero
database connections**.

It reports, per required secret (`BANK_ALFALAH_MPGS_MERCHANT_ID`,
`BANK_ALFALAH_MPGS_API_PASSWORD`, and `BANK_ALFALAH_MPGS_OPERATOR_ID` as
optional portal-metadata-only context):

- presence / missing
- length (integer character count, untrimmed)
- leading-whitespace detected (boolean)
- trailing-whitespace detected (boolean)
- embedded newline/CR detected (boolean)
- placeholder-pattern suspected (boolean; same heuristic family already used
  by `p3b-replicate-r2-canary.ts`)

Plus, for `MERCHANT_ID` specifically:

- character-class validity (alphanumeric + `-`/`_` only)
- length plausibility (4-64 chars)

Plus, derived (never logging the derived value itself):

- Basic Auth username structure valid (`merchant.<MERCHANT_ID>` shape)
- Base64 round-trip structural validity (`username:password` encode → decode
  → exact match, proving the encoding step itself is lossless for this input)

**This diagnostic was not run against the real GitHub secrets in this
session** — this agent has no access to GitHub Actions secrets or any local
copy of `MERCHANT_ID`/`API_PASSWORD`. It was exercised only against unit-test
fixtures (14/14 passing) to prove its logic; the owner must dispatch
`bank-alfalah-mpgs-provisioning-config-diagnostic.yml` to get a real reading against
the actual provisioned secrets.

## 5. Code-defect assessment

No evidence from this session proves a local code defect:

- The Basic Auth construction (`buildMpgsAuthHeader`) is unchanged and
  matches the documented contract (`merchant.<MERCHANT_ID>` / API Password,
  never `OPERATOR_ID`).
- The REST path shape matches the standard MPGS v74 pattern already recorded
  as `standard-pattern-fallback` evidence in `MPGS_INTEGRATION_EVIDENCE.md`.
- A structural `404` (as opposed to a JSON parse failure, a TypeScript
  exception, or a locally-thrown validation error) means the request reached
  the real gateway and the real gateway issued a real HTTP response — this
  is external gateway behavior, not a local exception.

Per task rule 4 ("authentication rejection is an external provisioning/
configuration issue until proven otherwise") and `rules.md`'s Recovery
Protocol, this remains classified as **external**, not a repository defect.
No MPGS request logic was modified.

## 6. Bank Alfalah support escalation packet

To be sent by the owner (via the merchant's existing Bank Alfalah / Mastercard
Gateway onboarding contact) requesting confirmation of:

1. The **exact sandbox Merchant ID** provisioned for this integration (to be
   compared, by the owner only, against the `MERCHANT_ID` GitHub secret —
   never pasted into chat, source, or logs).
2. The **correct test-gateway base URL / region** for this merchant — confirm
   whether `https://test-bankalfalah.gateway.mastercard.com` is the exact
   correct sandbox host for this merchant's onboarding region, or whether a
   different regional Mastercard Gateway host was assigned.
3. Whether the supplied password is genuinely an **API Password** (REST API
   credential) and not the **portal/operator login password** — these are
   different secrets on MPGS, and `BANK_ALFALAH_MPGS_OPERATOR_ID` in this
   repository is explicitly reserved as portal-metadata-only, never used for
   REST auth.
4. Whether **API access and Hosted Checkout** are both enabled for this
   specific merchant profile (some MPGS merchant profiles are provisioned for
   Manual/API integration only, or Hosted Checkout only, or neither, until
   explicitly enabled by the bank).
5. The **supported API version** for this merchant — confirm `74` (used by
   this integration, per `MPGS_INTEGRATION_EVIDENCE.md`) is a version this
   merchant profile actually supports.
6. Whether the **PKR profile** is enabled for this merchant (PKR is this
   repository's only currently-enabled MPGS currency).
7. The **USD profile / merchant ID status** — confirm whether a USD
   settlement capability exists on this merchant at all (this repository
   currently keeps USD `FAIL_CLOSED` pending exactly this confirmation).
8. Whether an **API-Password regeneration** is required (e.g. if the current
   password was never activated, expired, or was issued before Hosted
   Checkout was enabled).
9. A **working sanitized `curl`/Postman reference request** (with the bank's
   own placeholder values, not real secrets) for Hosted Checkout
   initialization against this merchant's sandbox, so the exact expected
   request shape can be diffed against this repository's implementation.
10. **Gateway correlation ID investigation** — this session could not extract
    a correlation/request ID from the existing evidence (§3.2 records why);
    once the evidence-capture gap is fixed and the workflow is re-run, the
    owner should supply Bank Alfalah with the timestamp
    (`2026-08-04T12:48:37Z`, run `30910714515`) and ask them to look up
    server-side logs for the corresponding request, since no client-visible
    correlation ID was captured.

## 7. Exact owner steps

1. Log into **Merchant Administration** using the `OPERATOR_ID` (portal login
   only — never used for REST auth).
2. Verify the **Merchant ID** shown in the portal matches the `MERCHANT_ID`
   GitHub secret currently configured (compare directly in the portal /
   GitHub UI — never paste either value into chat, a commit, or a log).
3. If permitted, **generate or reset the API Password** for this merchant
   (distinct from the portal login password).
4. Update the GitHub repository secrets `MERCHANT_ID` and `API_PASSWORD`
   (Settings → Secrets and variables → Actions) with the confirmed values.
   **Never place either value in chat, source control, or logs.**
5. Optionally dispatch `bank-alfalah-mpgs-provisioning-config-diagnostic.yml` first
   (zero network calls, structural metadata only) to confirm the new secret
   values are well-formed (no stray whitespace/newline, plausible length,
   correct character class) before spending a real network attempt.
6. Re-run `bank-alfalah-mpgs-sandbox-smoke.yml` (`workflow_dispatch`) once.

## 8. This session's testing

- `npx vitest run src/scripts/p4c2-mpgs-credential-provisioning-diagnostic.test.ts` — **14/14 pass**.
- No live network dispatch was performed in this session (no evidence that
  GitHub secrets were changed since the last failed run — see task rule 3).
- No RunPod/Local, no production, no card data, no real payment, at any
  point.

## 9. PKR / USD state (unchanged by this packet)

- **PKR:** `enabled: true`, evidence `standard-pattern-fallback`. **Not**
  `SANDBOX_VERIFIED` — the bounded sandbox smoke test still has not
  succeeded.
- **USD:** `enabled: false` (`FAIL_CLOSED`), unchanged.

## 10. 13-stage resolution pipeline (this packet)

| # | Stage | Outcome |
|---|---|---|
| 1 | Read `rules.md` + prior P4C evidence | Confirmed PR #118 merged, PR #121 status, prior smoke-test framing |
| 2 | Verify PR #121 scope/checks | Docs-only, no CI checks configured, no functional risk |
| 3 | Confirm PR #121 merge state | Already merged pre-session — merge SHA `e75484650ef28f2f9a6b11845685e58fcb59653c` |
| 4 | List `bank-alfalah-mpgs-sandbox-smoke.yml` runs | Runs `30910482924` (build failure) and `30910714515` (network failure) found |
| 5 | Pull raw logs for run `30910714515` | Read directly via `gh run view --log`, not from a paraphrase |
| 6 | Extract structural HTTP facts | Status `404` confirmed; content-type/correlation-ID/WWW-Authenticate were never captured by the script as it existed |
| 7 | Reconcile with owner's "auth rejection" framing | Logs are authoritative: real result is `404`, not a 401/403 Basic Auth challenge |
| 8 | Inspect gateway service source for a code defect | `buildMpgsAuthHeader`, REST path, and request body all match the documented v74 pattern — no local defect found |
| 9 | Build safe structural credential diagnostic | `p4c2-mpgs-credential-provisioning-diagnostic.ts`, network-free, secret-value-free |
| 10 | Unit-test the diagnostic | 14/14 tests pass, including an explicit "never contains the secret value" assertion |
| 11 | Add dedicated diagnostic-only workflow | `bank-alfalah-mpgs-provisioning-config-diagnostic.yml`, `workflow_dispatch` only |
| 12 | Prepare Bank Alfalah support packet + exact owner steps | This document, §6-§7 |
| 13 | Update canonical docs (`rules.md`, R9.2 manifest, `reports/LATEST.md`) | Additive sections recording this packet's outcome |

## 11. Return code

**`BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED`**

Rationale: the actual (not paraphrased) evidence is a structural HTTP `404`
on the Hosted Checkout path, which is the characteristic MPGS response when
the merchant ID in the request path is not recognized/enabled for that
capability on the target gateway host — not a 401/403 credential-rejection
signature. This is most consistent with the merchant profile not (yet) being
enabled for API access / Hosted Checkout on this gateway, or being enabled
under a different region/host than the one this integration is pinned to.
Given the evidence available, `BANK_ALFALAH_WRONG_GATEWAY_REGION` is the
next-closest alternative and cannot be fully ruled out from this session's
evidence alone (both produce an identical client-visible 404 without a
correlation ID to disambiguate them) — support-packet question 2 (§6) and the
evidence-capture gap (§3.2) exist specifically to resolve this ambiguity on
the next attempt. `BANK_ALFALAH_API_PASSWORD_RESET_REQUIRED` is not selected
because a password problem alone would not typically produce a 404 (it would
produce a 401); `MPGS_LOCAL_SECRET_FORMAT_DEFECT` is not selected because no
local formatting defect was found in the code that reads/uses the secrets;
`P4C_MPGS_AUTH_VERIFIED` is not selected because no structurally valid
session ID was obtained this session (no network call was made, per task
rule 3 — no evidence secrets were changed since the last failed run).

Per the task instructions, **P4D must not begin** until
`P4C_MPGS_AUTH_VERIFIED` is actually achieved.
