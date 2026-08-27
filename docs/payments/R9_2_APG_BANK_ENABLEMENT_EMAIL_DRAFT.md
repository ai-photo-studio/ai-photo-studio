# Bank Alfalah APG Sandbox Enablement Email

Status: **DRAFT — DO NOT SEND**

**Subject:** ThanNow APG sandbox — valid test instruments needed to complete UAT

Hello Bank Alfalah Support,

ThanNow's direct HS1001 Page Redirection integration is now working end to
end for our merchant/store profile: Handshake returns a valid `AuthToken`,
and the SSO redirect correctly lands on the hosted checkout page
(`PaymentTypeId` 1/2/3/empty all reach the page).

We are unable to complete a successful sandbox payment because we don't have
valid sandbox test instruments. Please provide:

- A valid sandbox **Alfa Wallet** number for our merchant/store, with any
  required test mobile number/OTP.
- A valid sandbox **Alfalah Bank Account** number for our merchant/store,
  with any required test mobile number/OTP.
- A valid sandbox **Credit/Debit/Prepaid Card** test PAN, with the exact
  expected expiry format and CVV, and which `CardTypeId` it corresponds to.
- Confirmation of which payment modes (Wallet / Account / Card / others)
  are currently enabled for our merchant/store in sandbox.
- Confirmation that a successful sandbox `OrderStatus` response includes an
  explicit `Currency` field (our verification logic requires an exact
  currency match before treating anything as paid, and we want to confirm
  this against a real successful response rather than assume it).

The values we attempted (from general integration testing conventions, not
Bank-confirmed) were rejected: Wallet and Account as "Invalid Account", and
the Card PAN/expiry were rejected by the hosted page's own validator before
a transaction was created. No transaction was created, no OTP was
requested, and no charge occurred at any point.

Our Return URL is `https://api.thannow.com/api/payments/bank-alfalah/return`,
our frontend return landing page is `https://thannow.com/payment/return`,
and our website is `https://thannow.com`.

No production payment or charge is enabled. `BANK_ALFALAH_APG_ENABLED`
remains `false` in production.

Regards,
ThanNow Engineering

---

## Superseded prior draft (kept for history, do not send)

The original draft below asked for HS1001 direct-access enablement — this
is now resolved (proven live, `HS_ChannelId=1001`,
`HS_IsRedirectionRequest=0` per the official Merchant Integration Guide
v1.1 p.7) and is no longer the blocker.

- Direct HS1001 hosted-payment-page access — **RESOLVED**, live-proven.
- Return/Listener URL registration — already defined and reachable.
- RequestHash order/encoding — still open in principle but not blocking
  (HS1001/SSO already succeed with the current implementation).
- IPN authentication/acknowledgement — still open; IPN remains
  supplementary to direct OrderStatus per the official guide, which
  presents OrderStatus polling as the primary, complete mechanism.
- `DoTran`/`ProcessTran` API-1002 fields — not applicable; ThanNow uses
  Page Redirection (Channel 1001) only, per this project's protected scope.
