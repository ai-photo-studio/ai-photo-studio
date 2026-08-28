# R9.6 — APG Bank Escalation Freeze (2026-08-28)

## Status

Application implementation: **FROZEN**. Classification:
**BANK_PUBLISHED_SAMPLE_REJECTED_FOR_STORE_PROFILE**. No code change is
authorized until the Bank responds with new evidence.

## Final proven flow (do not redesign)

1. `HS_ChannelId=1001`, `HS_IsRedirectionRequest=0` — form POST to
   `/HS/HS/HS` (`initiateRedirectionHandshake`) — returns a real
   `AuthToken`. Bank support directly instructed `=0`; live sandbox proves
   it works. **Never revert to `=1`.**
2. SSO POST (`buildSsoRedirect`, `ChannelId=1001`) redirects to the Bank's
   hosted checkout page, every run.
3. `TransactionTypeId`: `1`=Alfa Wallet, `2`=Alfalah Account,
   `3`=Credit/Debit Card, empty=All Payment Modes selector. Currency is
   always `PKR`.
4. Browser `GET /api/payments/bank-alfalah/return` is **non-authoritative**
   — never marks PAID, never trusts a query parameter.
5. `customer-checkout.service.ts#getStatus` -> `apgGateway.verifyAndApplyOrderStatus`
   is the **only** authoritative path: fresh server-initiated OrderStatus
   call, exact merchant/store/order/amount/currency match, `ResponseCode=00`
   + `TransactionStatus=Paid` required, then `applyVerifiedPaymentEvidence`
   commits PAID + entitlement + execution idempotently in one transaction.
6. `POST /api/payments/bank-alfalah/ipn` is supplementary and fails closed:
   `503 APG_DISABLED` while disabled, `400` for any non-allowlisted
   callback `url`, never fetches or mutates.
7. Production flags stay off, structurally enforced in
   `apps/api/src/config/env.ts` (APG cannot be enabled outside sandbox even
   if the flag were flipped): `BANK_ALFALAH_PROVIDER=none`,
   `BANK_ALFALAH_APG_ENABLED=false`, `BANK_ALFALAH_MPGS_ENABLED=false`.

## Protected — never reintroduce into ThanNow customer checkout

- `HS_ChannelId=1002` / `DoTran` / `ProcessTran` (the alternate API-channel
  flow — exists in `bank-alfalah-apg-gateway.service.ts` as reference code
  only, never called from checkout).
- `HS_IsRedirectionRequest=1`.
- Hoja Apps Script.
- MPGS reactivation (`BANK_ALFALAH_MPGS_ENABLED=true`).

## Evidence (sanitized)

| Mode | Transactions | Result |
| --- | --- | --- |
| Alfa Wallet | `301954137241`, `443330289493` | `Invalid Account`, OrderStatus `Failed` |
| Alfalah Account | `302795473632`, `446691489639` | `Invalid Account`, OrderStatus `Failed` |
| Credit/Debit Card | none issued | rejected by hosted page's own Luhn/expiry validator pre-transaction |

No blind retry of these instruments is planned. Full run detail:
`docs/payments/R9_5_APG_FINAL_SANDBOX_UAT_RESULTS.md`.

## Bank escalation

`docs/payments/R9_2_APG_BANK_ENABLEMENT_EMAIL_DRAFT.md` —
**READY_TO_SEND**. Asks the Bank to confirm Wallet/Account/Card enablement
for Store 567249, why the published samples are rejected, corrected
sandbox instruments if needed, the accepted Card format, the OrderStatus
`Currency` contract, and production activation steps. Not sent — no owner
authorization present in this task.

## Resume path (when the Bank responds)

Dispatch `.github/workflows/bank-alfalah-apg-hosted-checkout-uat.yml`
(`gh workflow run bank-alfalah-apg-hosted-checkout-uat.yml --ref main -f
mode=<wallet|account|card|all>`) after updating the relevant
`APG_SANDBOX_*` GitHub Actions secrets with the Bank-corrected values.
Never hardcode instruments into source. Never log secrets, AES keys,
hashes, or `AuthToken` — already enforced by the workflow and script. If a
payment succeeds, the existing `verifyAndApplyOrderStatus` chain above
takes over automatically; verify idempotency, concurrent-duplicate safety,
forged-Return rejection, and amount/currency/order-mismatch rejection
before declaring UAT passed.
