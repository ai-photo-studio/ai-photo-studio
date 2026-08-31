# Bank Alfalah APG Sandbox Enablement Email

Status: **READY_TO_SEND — awaiting owner authorization to send**

Last refreshed 2026-08-31 (R9.7-APG-BANK-RESPONSE-WAIT, reply from
Muhammad Taha received), against fully recovered ThanNow runtime
(API/DB/Redis all healthy). Application implementation remains frozen —
no further code changes; the Card/Wallet rejections are confirmed
Bank-side, not app defects.

**Subject:** ThanNow (Merchant 15248 / Store 567249) — Wallet still rejected, Card still rejected after your suggested expiry fix

Hello Bank Alfalah Support (thank you for the reply confirming the Alfalah
Account is closed for our profile — noted, we've stopped testing that
mode),

ThanNow's direct HS1001 Page Redirection integration is working end to end
for our Merchant `15248` / Store `567249` profile:

- Handshake (`HS_ChannelId=1001`, `HS_IsRedirectionRequest=0`) returns a
  valid `AuthToken`.
- SSO correctly redirects to the hosted checkout page for Alfa Wallet,
  Credit/Debit Card, and All Modes selector.

Per your instruction we tested only Wallet and Card again:

- **Alfa Wallet** (published sample number): a third transaction was
  created (`TransactionId 797003508935`, following prior
  `301954137241`, `443330289493`), Bank again responded `Invalid Account`.
  Authoritative `OrderStatus` confirmed `TransactionStatus=Failed`.
- **Credit/Debit Card** (published sample PAN, CVV, expiry updated to
  `2030` per your instruction): unchanged outcome. The hosted page's own
  client-side validator (`CheckLuhnsAlgo`) rejects the Card Number before
  the Expiry field is ever evaluated — the Card Number and Expiry Month
  fields are cleared by the page's own script immediately after
  `CheckLuhnsAlgo` runs, even when entered via real keystroke events. The
  expiry-year fix did not change this because the rejection happens at
  the card-number step, before expiry is checked. No `TransactionId` is
  issued for this mode.

Could you please confirm:

a. Alfa Wallet is enabled for our Merchant/Store `567249` — if so, is
   the published sample Wallet number itself invalid for our store, and
   if so, what is the correct Store `567249`-compatible sandbox Wallet
   number?
b. Credit/Debit Card is enabled for our Merchant/Store `567249` — if so,
   why the published sample card number fails your own hosted page's
   Luhn check (`CheckLuhnsAlgo`) before any transaction is created, and
   the correct Store `567249`-compatible sandbox card number.
c. The exact accepted Card number/expiry/CVV input format, since neither
   the originally published sample nor the `2030`-expiry correction has
   passed your own hosted page's validator.
d. That a successful sandbox `OrderStatus` response contract includes
   an explicit `Currency` field — our verification logic requires an
   exact currency match (`PKR`) before treating any transaction as
   paid, and every response so far has omitted `Currency` entirely.
e. The production activation steps required once sandbox UAT passes
   (any additional enablement, credentials, or Bank-side sign-off
   needed before we may set `BANK_ALFALAH_APG_ENABLED=true` in
   production).
f. Whether `www.thannow.com` and `api.thannow.com` need to be explicitly
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
- 2026-08-28 R9.6 refresh — superseded by the 2026-08-31 refresh above,
  which adds Merchant `15248`, the whitelist question, and then
  incorporates the Bank's own reply (Muhammad Taha, 2026-08-31): Alfalah
  Account is permanently closed for this profile (question dropped,
  mode retired from testing), and the suggested `2030` Card expiry fix
  was tested and did not change the outcome (rejection happens at the
  card-number Luhn-check step, before expiry is evaluated).
