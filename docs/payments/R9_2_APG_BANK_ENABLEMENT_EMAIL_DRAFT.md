# Bank Alfalah APG Sandbox Enablement Email

Status: **READY_TO_SEND — awaiting owner authorization to send**

Last refreshed with live evidence: 2026-08-28 (R9.5-APG-FINAL-SANDBOX-UAT),
against fully recovered ThanNow runtime (API/DB/Redis all healthy,
`api.thannow.com/api/version` build SHA `e411ccd6...`).

**Subject:** ThanNow (Store 567249) — Bank-published sandbox test data rejected

Hello Bank Alfalah Support,

ThanNow's direct HS1001 Page Redirection integration is working end to end
for our merchant/store profile:

- Handshake (`HS_ChannelId=1001`, `HS_IsRedirectionRequest=0`) returns a
  valid `AuthToken`.
- SSO correctly redirects to the hosted checkout page for all four
  `TransactionTypeId` configurations (1=Alfa Wallet, 2=Alfalah Bank
  Account, 3=Credit/Debit Card, empty=All Modes selector).

We used the exact sandbox sample data published in our own Merchant Portal
Dashboard ("Sample Data For Testing" section, Store `ThanNow`) — not
placeholder or invented values — and every payment mode was rejected,
reconfirmed today with fresh transactions:

- **Alfa Wallet** (published sample number): transaction created
  (`TransactionId 301954137241`), Bank responded `Invalid Account`.
  Authoritative `OrderStatus` confirmed `TransactionStatus=Failed`.
- **Alfalah Account** (published sample number): transaction created
  (`TransactionId 302795473632`), same outcome —`Invalid Account`,
  `OrderStatus` confirmed `TransactionStatus=Failed`.
- **Credit/Debit Card** (published sample PAN/expiry/CVV): the hosted
  page's own client-side validator (`CheckLuhnsAlgo` /
  `CheckExpiryYear`) rejects the published card number before a
  transaction is ever created — the Card Number and Expiry Month
  fields are cleared by the page's own script immediately after
  validation runs, even when entered via real keystroke events (ruled
  out a form-fill artifact on our side; reproduced identically twice).
  No `TransactionId` is issued for this mode.

Could you please confirm:

1. Whether Alfa Wallet, Alfalah Account, and Credit/Debit Card payment
   modes are currently **enabled** for Store `567249` (ThanNow) — we
   could not find a per-mode enablement indicator in the Merchant
   Portal.
2. If the published sample data should work for our store, why it is
   being rejected — or, if it is generic/shared data not valid for our
   specific store profile, the correct store-compatible sandbox Wallet,
   Account, and Card values.
3. The exact expected input format for the Card fields (expiry as
   separate month/year vs. combined, any other formatting requirement)
   given that the published sample fails your own hosted page's
   client-side Luhn/expiry check.
4. That a successful sandbox `OrderStatus` response includes an
   explicit `Currency` field — our verification logic requires an exact
   currency match (`PKR`) before treating any transaction as paid, and
   every response so far has omitted `Currency` entirely.
5. The production onboarding steps required once sandbox UAT passes
   (any additional enablement, credentials, or Bank-side sign-off
   needed before we may set `BANK_ALFALAH_APG_ENABLED=true` in
   production).

Our Return URL is `https://api.thannow.com/api/payments/bank-alfalah/return`,
our frontend return landing page is `https://thannow.com/payment/return`,
and our website is `https://thannow.com`.

No production payment or charge is enabled. `BANK_ALFALAH_APG_ENABLED`
remains `false` in production.

Regards,
ThanNow Engineering

---

## Superseded prior drafts (kept for history, do not send)

- Original draft asking for HS1001 direct-access enablement — **RESOLVED**,
  live-proven (`HS_ChannelId=1001`, `HS_IsRedirectionRequest=0` per the
  official Merchant Integration Guide v1.1 p.7).
- Intermediate draft asking "please provide valid sandbox test
  instruments" as if none were published — **CORRECTED**: the Bank does
  publish sample data in the Merchant Portal Dashboard for Store `ThanNow`;
  it was located, used exactly as published, and rejected. The current
  draft above reflects this corrected understanding.
- 2026-08-27 draft — superseded by the 2026-08-28 refresh above, which adds
  transaction IDs, the Card client-side-validator finding, and the
  production-onboarding question.
