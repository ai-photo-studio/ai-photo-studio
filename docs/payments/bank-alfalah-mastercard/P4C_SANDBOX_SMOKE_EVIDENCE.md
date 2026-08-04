# Bank Alfalah MPGS — Sandbox Smoke Test Evidence (R9.2-P4C)

**Status:** Sandbox authentication call REJECTED (structural HTTP 404). PKR remains **not** `SANDBOX_VERIFIED`. No card data, no capture, no Replicate/R2/worker call was made at any point.

## 1. What ran

Workflow: `.github/workflows/bank-alfalah-mpgs-sandbox-smoke.yml` (`workflow_dispatch` only, hardcoded sandbox origin `https://test-bankalfalah.gateway.mastercard.com`, timeout 10m, concurrency group of 1), dispatched from `main` twice:

| Run | Ref | Result | Cause |
|---|---|---|---|
| [`30910482924`](https://github.com/ai-photo-studio/ai-photo-studio/actions/runs/30910482924) | `main` | `failure` | Build-dependency error: `@prisma/client did not initialize yet` — CI runner never ran `prisma generate` before the smoke script imported the P4A payment-evidence module transitively. No network call was attempted. No secret exposure (job env values redacted by GitHub's own log masking; script printed presence-only booleans). |
| [`30910714515`](https://github.com/ai-photo-studio/ai-photo-studio/actions/runs/30910714515) | `main` (after PR #120 fix) | `failure` | Structural **HTTP 404** on Hosted Checkout initialization (`PUT .../api/rest/version/74/merchant/{merchantId}/order/{orderId}/checkout`). Both `MERCHANT_ID` and `API_PASSWORD` GitHub secrets were confirmed **present** before the call (presence-only check). Retrieve Order was never reached because initialization failed first. |

## 2. Sanitized failure evidence (run `30910714515`)

Exact console lines from the smoke script (`apps/api/src/scripts/p4c-bank-alfalah-mpgs-sandbox-smoke.ts`), copied verbatim from the GitHub Actions log — no secret value appears anywhere in this script's output by construction (it prints only presence booleans, string lengths, and gateway-reported enums):

```
R9.2-P4C Bank Alfalah MPGS sandbox smoke test
pinned sandbox origin: https://test-bankalfalah.gateway.mastercard.com
required secrets (presence only, never values):
  BANK_ALFALAH_MPGS_MERCHANT_ID: present
  BANK_ALFALAH_MPGS_API_PASSWORD: present
  BANK_ALFALAH_MPGS_OPERATOR_ID (portal metadata only, not used for auth): present
synthetic test order id: p4c-sandbox-smoke-bc11cab5-0cde-4083-a366-62acf5a615d4 (no card data, no capture)

[1/2] Hosted Checkout initialization...
  FAILED: Bank Alfalah MPGS initiateHostedCheckout failed with status 404
```

The script exited 2 (network call attempted, gateway rejected it) as designed. Retrieve Order (`[2/2]`) was never invoked because the flow stops on the first failure.

## 3. Interpretation

A `404` (rather than `401`/`403`) most commonly indicates one of:
- the REST path shape (`/api/rest/version/{v}/merchant/{merchantId}/order/{orderId}/checkout`) does not exactly match what this specific Bank Alfalah MPGS sandbox merchant profile expects,
- the configured `BANK_ALFALAH_MPGS_MERCHANT_ID` secret does not correspond to a merchant profile provisioned on `test-bankalfalah.gateway.mastercard.com`, or
- the sandbox merchant profile requires a different API version, checkout mode, or onboarding step not documented anywhere this session could confirm.

This repository's PR #118 evidence doc (`MPGS_INTEGRATION_EVIDENCE.md`) already flagged every field/endpoint as `standard-pattern-fallback` (not `doc-confirmed-live-fetch`), because the official Mastercard Gateway documentation portal only returns a client-rendered JavaScript shell to a plain HTTP GET. This 404 is exactly the kind of external-protocol uncertainty that fallback evidence grade predicted could exist.

Per `rules.md`'s Recovery Protocol, this is a **true stop**, not a recoverable failure: diagnosing the exact expected REST path/merchant-provisioning shape for this specific bank's MPGS sandbox account is "a genuinely external protocol/spec this repository does not define." No further code guess-and-retry was attempted against the live sandbox.

## 4. Currency verification status (per task instruction)

- **PKR:** remains its pre-existing `standard-pattern-fallback` gating in code (`MPGS_CURRENCY_SUPPORT.PKR.enabled = true`). It does **NOT** become `SANDBOX_VERIFIED` — the bounded sandbox smoke test did not succeed.
- **USD:** unchanged, `FAIL_CLOSED` (`MPGS_CURRENCY_SUPPORT.USD.enabled = false`). No merchant capability evidence was obtained for USD.

## 5. What the owner needs to unblock this

One of:
1. Confirm the exact Hosted Checkout REST path / API version this specific Bank Alfalah MPGS sandbox merchant profile expects (from the merchant onboarding email, portal, or a reachable copy of the integration guide), or
2. Confirm the `MERCHANT_ID` / `API_PASSWORD` GitHub secrets currently configured actually correspond to a provisioned MPGS sandbox merchant account (as opposed to placeholder/unprovisioned values), or
3. Supply a working `curl`/Postman example against the sandbox from Bank Alfalah's own onboarding documentation so the exact request shape can be matched.

## 6. Protected-scope confirmation

- No card data was ever constructed or sent.
- No payment capture/transaction occurred (Hosted Checkout initialization never succeeded; Retrieve Order was never reached).
- No Replicate, R2, or RunPod/worker call was made by the smoke script or its workflow.
- The workflow ran on `workflow_dispatch` only, against the hardcoded sandbox origin, with concurrency 1 and a 10-minute timeout.
- No secret value was printed, logged, or committed anywhere in this evidence.
