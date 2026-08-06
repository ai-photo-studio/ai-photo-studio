# R9.2 APG URL Ingress Protocol

Status: **URL foundation only. No status inquiry, acknowledgement,
authentication, or payment mutation exists.** MPGS remains commercially
frozen (`MPGS_STATUS = "MPGS_COMMERCIAL_HOLD"`). No live bank request, APG
activation, production deployment, or payment success simulation was made
by this packet.

## 1. Exact URLs

| Purpose | URL |
|---|---|
| Return (browser) | `https://api.thannow.com/api/payments/bank-alfalah/return` |
| Listener (server-to-server IPN) | `https://api.thannow.com/api/payments/bank-alfalah/ipn` |
| Frontend landing page | `https://thannow.com/payment/return` |

Local route paths (environment-owned origin, no hardcoded host):
`GET /api/payments/bank-alfalah/return`, `POST /api/payments/bank-alfalah/ipn`,
frontend `/payment/return`.

## 2. Behavior contract

- **Disabled by default**: `BANK_ALFALAH_APG_ENABLED` defaults `"false"`.
  Both routes exist (so the bank can validate reachability once given the
  URLs) but always respond truthfully — the return route always reports
  `PAYMENT_UNAVAILABLE`; the IPN listener returns `503 APG_DISABLED` while
  disabled.
- **Return route never marks PAID**: only reads two documented-shaped
  query parameter *names* (`orderNo`, `sessionId`) purely to log their
  presence — never to infer or write payment status. No
  `applyVerifiedPaymentEvidence` call exists anywhere in this module.
- **Frontend shows pending/unavailable truthfully**: `/payment/return`
  never reads a URL query parameter and always renders exactly "Online
  payment is temporarily unavailable."
- **Listener accepts the documented `url` parameter** and validates it
  against an **exact, environment-owned hostname allowlist**
  (`BANK_ALFALAH_APG_ALLOWED_CALLBACK_HOSTS`, comma-separated, empty by
  default — fails closed until the owner configures real, bank-confirmed
  hosts). Validation requires: present, well-formed, `https:` scheme
  exactly, and an exact (not prefix/suffix/substring) hostname match
  against the allowlist. Classic SSRF tricks (userinfo-embedded host,
  approved-looking substrings in the path) are rejected because
  `URL.hostname` parsing is used, never string matching on the raw input.
- **The listener never fetches the URL.** Even an approved host produces
  only a `202 ACKNOWLEDGED_NO_ACTION` response — no outbound request, no
  status inquiry, no payment mutation. This is enforced structurally (no
  `fetch`/`http.request`/`https.request`/`axios` call exists anywhere in
  the controller) and checked by `verify:apg-url-contract`.
- **MPGS remains commercially frozen**: `BANK_ALFALAH_MPGS_ENABLED` is
  untouched, still defaults `"false"`; nothing in this packet re-enables
  or modifies the MPGS gateway module.
- **No JazzCash/RAAST/COD/bank-transfer flow was invented.** This
  foundation is generically named "Bank Alfalah APG" per the owner's
  stated intent; no specific rail's protocol shape is assumed.

## 3. What remains `AWAITING_BANK_CONFIRMATION`

Per the task's explicit instruction, the following are **not implemented**
and must not be guessed:

- **Status inquiry** (the APG equivalent of MPGS's Retrieve Order).
- **Acknowledgement** requirements/format for the IPN listener.
- **Authentication** (how the bank authenticates itself to this listener,
  and how this server would authenticate to any bank-side status API).
- **Payment mutation** — no code path from either route ever reaches
  `applyVerifiedPaymentEvidence`.

See `docs/payments/R9_2_APG_REQUIREMENTS_MATRIX.md` for the full 13-row
matrix (unchanged from the freeze packet, carried forward).

## 4. SSRF prevention (exact mechanism)

`isAllowedApgCallbackUrl(rawUrl, allowedHostsCsv)` in
`apps/api/src/controllers/bank-alfalah-apg.controller.ts`:

1. Reject if `rawUrl` is missing/empty.
2. Parse with the WHATWG `URL` constructor; reject on parse failure
   (malformed).
3. Reject if `protocol !== "https:"`.
4. Split `allowedHostsCsv` into an exact hostname list; reject if empty
   (fail-closed default).
5. Reject unless `parsed.hostname` (the URL parser's own authoritative
   host, immune to userinfo/path/query tricks) is an exact match in the
   allowlist.
6. Only then return `allowed: true` — and even then, the caller never
   fetches the URL.

Proven by 9 unit tests
(`apps/api/src/controllers/bank-alfalah-apg.controller.test.ts`) including
two explicit SSRF-trick cases (embedded-host-in-path, userinfo host
confusion) and a static source-scan test confirming no network-call
primitive exists in the file.

## 5. `npm run verify:apg-url-contract`

12 checks, repository-configuration-and-source-only, zero external calls:
both exact routes present with correct HTTP methods and mounted; APG and
MPGS both default disabled; the APG allowlist defaults empty; the return
handler never calls `applyVerifiedPaymentEvidence` or writes a literal
`"PAID"`; the listener enforces exact (not loose) host matching and
rejects non-HTTPS; neither handler makes an outbound network call; the
frontend never reads URL query parameters or contains a fabricated-success
string; the `/payment/return` route is registered; no hardcoded
localhost/secret in the new files. All 12 pass on the real repository;
every check was proven against a temporary failing fixture then reverted.

## 6. Result

- Payment-free staging (upload → preview → pricing → `FixedOrder` →
  truthful checkout-unavailable message) remains fully proven and
  unaffected.
- Commercial launch remains blocked — this packet adds ingress plumbing
  only, no working payment path of any kind.
- Next step is entirely bank-dependent: once official APG documents
  arrive, the requirements matrix converts row-by-row from
  `AWAITING_BANK_CONFIRMATION` to a real, tested implementation — never
  guessed ahead of that.
