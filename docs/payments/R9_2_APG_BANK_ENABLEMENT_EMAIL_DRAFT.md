# Bank Alfalah APG Sandbox Enablement Email

Status: **DRAFT — DO NOT SEND**

**Subject:** ThanNow APG sandbox HS1001 enablement and callback registration

Hello Bank Alfalah Support,

ThanNow has completed its local Alfa Payment Gateway sandbox integration for
the configured merchant profile. Please enable and confirm the following for
the merchant and store identifiers already supplied through our secure channel:

- Direct HS1001 hosted-payment-page access for the sandbox merchant/store identifiers.
- Registration/whitelisting of our Return URL:
  `https://api.thannow.com/api/payments/bank-alfalah/return`
- Registration/whitelisting of our Listener/IPN URL:
  `https://api.thannow.com/api/payments/bank-alfalah/ipn`
- Exact RequestHash input order, encoding, encryption, and delimiter contract.
- IPN authentication/signature requirements.
- Required IPN acknowledgement response, status code, and retry/duplicate behavior.
- Allowed sandbox OrderStatus host/path and required authentication fields.
- Sandbox refund/void procedure.
- Settlement/reconciliation and sandbox-to-production go-live procedure.

Our website is `https://thannow.com` and the frontend return landing page is
`https://thannow.com/payment/return`.

Our single sanitized sandbox test produced:

- HS1001 RequestHash generation: successful
- HTTP response: `200`
- Response status: `PAYMENT_UNAVAILABLE`
- AuthToken: absent
- Retries: zero
- Transaction/charge: zero

Please confirm the required enablement or provide the exact server-side
contract/fields needed for direct HS1001 access. No production payment or
charge is enabled.

Regards,
ThanNow Engineering
