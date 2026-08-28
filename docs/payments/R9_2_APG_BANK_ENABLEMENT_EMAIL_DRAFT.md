# Bank Alfalah APG Sandbox Enablement Email

Status: **READY_TO_SEND — awaiting owner authorization to send**

Last refreshed 2026-08-28 (R9.7-APG-BANK-RESPONSE-WAIT), against fully
recovered ThanNow runtime (API/DB/Redis all healthy,
`api.thannow.com/api/version` build SHA `e411ccd6...`). Application
implementation remains frozen — no further code changes pending Bank
response. No new sandbox calls made this session (no new Bank evidence).

**Subject:** ThanNow (Merchant 15248 / Store 567249) — Bank-published sandbox test data rejected

Hello Bank Alfalah Support,

ThanNow's direct HS1001 Page Redirection integration is working end to end
for our Merchant `15248` / Store `567249` profile:

- Handshake (`HS_ChannelId=1001`, `HS_IsRedirectionRequest=0`) returns a
  valid `AuthToken`.
- SSO correctly redirects to the hosted checkout page for all four
  `TransactionTypeId` configurations (1=Alfa Wallet, 2=Alfalah Bank
  Account, 3=Credit/Debit Card, empty=All Modes selector).

We used the exact sandbox sample data published in our own Merchant Portal
Dashboard ("Sample Data For Testing" section, Store `ThanNow`) — not
placeholder or invented values — and every payment mode was rejected,
reconfirmed today with fresh transactions:

- **Alfa Wallet** (published sample number): two transactions created
  on separate dates (`TransactionId 301954137241`, `443330289493`), Bank
  responded `Invalid Account` both times. Authoritative `OrderStatus`
  confirmed `TransactionStatus=Failed`.
- **Alfalah Account** (published sample number): two transactions created
  on separate dates (`TransactionId 302795473632`, `446691489639`), same
  outcome — `Invalid Account`, `OrderStatus` confirmed
  `TransactionStatus=Failed`.
- **Credit/Debit Card** (published sample PAN/expiry/CVV): the hosted
  page's own client-side validator (`CheckLuhnsAlgo` /
  `CheckExpiryYear`) rejects the published card number before a
  transaction is ever created — the Card Number and Expiry Month
  fields are cleared by the page's own script immediately after
  validation runs, even when entered via real keystroke events (ruled
  out a form-fill artifact on our side; reproduced identically twice).
  No `TransactionId` is issued for this mode.

Could you please confirm:

a. Alfa Wallet is enabled for our Merchant/Store `567249`.
b. Alfalah Account is enabled for our Merchant/Store `567249`.
c. Credit/Debit Card is enabled for our Merchant/Store `567249`.
d. Why the Bank portal's published Wallet and Account test data returns
   `Invalid Account` for our store profile.
e. Why the Bank portal's published Card test data is rejected by your
   own hosted-page validator before a transaction is even created.
f. If the generic published samples are not valid for our specific
   store, the working Store `567249`-compatible sandbox Wallet,
   Account, and Card values.
g. The exact accepted Card expiry/input format, given that the
   published sample fails your own hosted page's client-side
   Luhn/expiry check.
h. That a successful sandbox `OrderStatus` response contract includes
   an explicit `Currency` field — our verification logic requires an
   exact currency match (`PKR`) before treating any transaction as
   paid, and every response so far has omitted `Currency` entirely.
i. The production activation steps required once sandbox UAT passes
   (any additional enablement, credentials, or Bank-side sign-off
   needed before we may set `BANK_ALFALAH_APG_ENABLED=true` in
   production).
j. Whether `www.thannow.com` and `api.thannow.com` need to be explicitly
   whitelisted on your side for our Return URL and hosted-page redirect
   to be accepted.

Our Return URL is `https://api.thannow.com/api/payments/bank-alfalah/return`,
our frontend return landing page is `https://thannow.com/payment/return`,
and our website is `https://www.thannow.com`.

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
- 2026-08-28 R9.5 refresh — superseded by the R9.6 freeze refresh above,
  which restructures the questions to the exact a-i list and adds the
  second Wallet/Account transaction IDs (`443330289493`, `446691489639`).
- 2026-08-28 R9.6 refresh — superseded by the R9.7 refresh above, which
  adds Merchant `15248` to the subject/opening and question (j) asking
  whether `www.thannow.com`/`api.thannow.com` need explicit whitelisting.
