# Bank Alfalah APG Sandbox Enablement Email

Status: **READY_TO_SEND — awaiting owner authorization to send**

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
placeholder or invented values — and every payment mode was rejected:

- **Alfa Wallet** (published sample number): a transaction was created and
  Bank responded `Invalid Account`. Authoritative `OrderStatus` confirmed
  `Failed`.
- **Alfalah Account** (published sample number): same outcome — transaction
  created, Bank responded `Invalid Account`, `OrderStatus` confirmed
  `Failed`.
- **Credit/Debit Card** (published sample PAN/expiry/CVV): rejected by the
  hosted checkout page's own validator before a transaction was even
  created.

Could you please confirm:

1. Whether Alfa Wallet, Alfalah Account, and Credit/Debit Card payment
   modes are currently **enabled** for Store `567249` (ThanNow) — we could
   not find a per-mode enablement indicator in the Merchant Portal.
2. If the published sample data should work for our store, why it is
   being rejected — or, if it is generic/shared data not valid for our
   specific store profile, the correct merchant/store-compatible sandbox
   instruments.
3. The exact expected input format for the Card fields (expiry as
   separate month/year vs. combined, any other formatting requirement) if
   different from what is shown in the Sample Data section.
4. That a successful sandbox `OrderStatus` response includes an explicit
   `Currency` field — our verification logic requires an exact currency
   match before treating any transaction as paid.

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
